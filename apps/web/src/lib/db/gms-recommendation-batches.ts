import type { RecommendationServingDecision } from "@/lib/recommendations/serving";

import {
  preparePersonalizedEmsRecommendations,
  selectPreparedPersonalizedRecommendations,
  type EmsRecommendationTrack,
  type PersonalizedRecommendations,
  type RecommendationShadowPayload,
} from "./gms-recommendations";
import type { TransactionExecutor } from "./music-library";
import { getDatabasePool } from "./pool";

const DEFAULT_BATCH_SIZE = 12;
const MAX_BATCH_SIZE = 24;
const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 50;

type RecommendationBatchRow = {
  created_at: Date | string;
  id: string;
  recommendations: unknown;
  status: "current" | "replaced" | "exhausted";
};

export type RecommendationHistoryEntry = {
  batchId: string;
  createdAt: string;
  rankingVersion: "baseline" | "hybrid-v0";
  tracks: EmsRecommendationTrack[];
};

export type PersonalizedRecommendationBatch = {
  batchId: string | null;
  createdAt: string | null;
  exhausted: boolean;
  newlyCreated: boolean;
  recommendations: PersonalizedRecommendations;
  serving: RecommendationServingDecision | null;
  shadow: RecommendationShadowPayload | null;
};

type ReleasableExecutor = TransactionExecutor & { release?: () => void };

function safeLimit(limit: number) {
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(limit)));
}

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isRecommendationTrack(value: unknown): value is EmsRecommendationTrack {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const track = value as Partial<EmsRecommendationTrack>;
  return typeof track.id === "string"
    && typeof track.title === "string"
    && typeof track.artist === "string"
    && typeof track.album === "string"
    && typeof track.artworkClass === "string"
    && typeof track.artworkUrl === "string";
}

function parseRecommendations(value: unknown): PersonalizedRecommendations {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored recommendation batch is invalid.");
  }
  const result = parsed as Partial<PersonalizedRecommendations>;
  if (typeof result.profileReady !== "boolean"
    || (result.profileVersion !== null && typeof result.profileVersion !== "string")
    || (result.rankingVersion !== "baseline" && result.rankingVersion !== "hybrid-v0")
    || !Array.isArray(result.tracks)
    || !result.tracks.every(isRecommendationTrack)) {
    throw new Error("Stored recommendation batch is invalid.");
  }
  return result as PersonalizedRecommendations;
}

async function inTransaction<T>(
  executor: TransactionExecutor | undefined,
  work: (transaction: TransactionExecutor) => Promise<T>,
) {
  if (executor) return work(executor);
  const client = await getDatabasePool().connect() as ReleasableExecutor;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release?.();
  }
}

async function lockUser(auth0Subject: string, transaction: TransactionExecutor) {
  const result = await transaction.query<{ id: string }>(
    `SELECT id
     FROM app_users
     WHERE auth0_subject = $1
     FOR UPDATE`,
    [auth0Subject],
  );
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Recommendation user was not found.");
  return userId;
}

async function loadActiveBatch(userId: string, transaction: TransactionExecutor) {
  const result = await transaction.query<RecommendationBatchRow>(
    `SELECT id, status, recommendations, created_at
     FROM user_recommendation_batches
     WHERE user_id = $1 AND status IN ('current', 'exhausted')
     ORDER BY created_at DESC, id DESC
     LIMIT 1
     FOR UPDATE`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function visibleRecommendations(
  userId: string,
  recommendations: PersonalizedRecommendations,
  transaction: TransactionExecutor,
) {
  const trackIds = recommendations.tracks.map((track) => track.id);
  if (trackIds.length === 0) return recommendations;
  const hidden = await transaction.query<{ source_track_id: string }>(
    `SELECT DISTINCT source_track_id
     FROM user_recommendation_decisions
     WHERE user_id = $1
       AND source_track_id = ANY($2::uuid[])
       AND decision IN ('accept', 'reject')`,
    [userId, trackIds],
  );
  const hiddenIds = new Set(hidden.rows.map((row) => row.source_track_id));
  return {
    ...recommendations,
    tracks: recommendations.tracks.filter((track) => !hiddenIds.has(track.id)),
  };
}

async function savedBatchResult(
  userId: string,
  row: RecommendationBatchRow,
  transaction: TransactionExecutor,
): Promise<PersonalizedRecommendationBatch> {
  const recommendations = await visibleRecommendations(
    userId,
    parseRecommendations(row.recommendations),
    transaction,
  );
  return {
    batchId: row.id,
    createdAt: isoDate(row.created_at),
    exhausted: row.status === "exhausted",
    newlyCreated: false,
    recommendations,
    serving: null,
    shadow: null,
  };
}

async function insertBatch(
  userId: string,
  recommendations: PersonalizedRecommendations,
  shadow: RecommendationShadowPayload | null,
  serving: RecommendationServingDecision,
  transaction: TransactionExecutor,
): Promise<PersonalizedRecommendationBatch> {
  if (!recommendations.profileReady || !recommendations.profileVersion) {
    return {
      batchId: null,
      createdAt: null,
      exhausted: false,
      newlyCreated: false,
      recommendations,
      serving: null,
      shadow: null,
    };
  }
  const trackIds = recommendations.tracks.map((track) => track.id);
  const status = trackIds.length === 0 ? "exhausted" : "current";
  const inserted = await transaction.query<{ created_at: Date | string; id: string }>(
    `INSERT INTO user_recommendation_batches (
       user_id, status, profile_version, ranking_version, recommendations, track_ids
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::uuid[])
     RETURNING id, created_at`,
    [
      userId,
      status,
      recommendations.profileVersion,
      recommendations.rankingVersion,
      JSON.stringify(recommendations),
      trackIds,
    ],
  );
  const batch = inserted.rows[0];
  if (!batch) throw new Error("Recommendation batch was not created.");
  if (trackIds.length > 0) {
    await transaction.query(
      `INSERT INTO user_recommendation_exposures (
         user_id, track_id, batch_id, position, ranking_version
       )
       SELECT $1, exposed.track_id, $2, exposed.position, $3
       FROM unnest($4::uuid[]) WITH ORDINALITY AS exposed(track_id, position)`,
      [userId, batch.id, recommendations.rankingVersion, trackIds],
    );
  }
  return {
    batchId: batch.id,
    createdAt: isoDate(batch.created_at),
    exhausted: status === "exhausted",
    newlyCreated: true,
    recommendations,
    serving,
    shadow,
  };
}

async function createBatch(
  auth0Subject: string,
  userId: string,
  limit: number,
  transaction: TransactionExecutor,
) {
  const prepared = await preparePersonalizedEmsRecommendations(
    auth0Subject,
    safeLimit(limit),
    transaction,
  );
  const selected = selectPreparedPersonalizedRecommendations(auth0Subject, prepared);
  return insertBatch(
    userId,
    selected.recommendations,
    prepared.shadow,
    selected.serving,
    transaction,
  );
}

export async function getOrCreatePersonalizedRecommendationBatch(
  auth0Subject: string,
  limit = DEFAULT_BATCH_SIZE,
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    const userId = await lockUser(auth0Subject, transaction);
    const current = await loadActiveBatch(userId, transaction);
    if (current) return savedBatchResult(userId, current, transaction);
    return createBatch(auth0Subject, userId, limit, transaction);
  });
}

export async function rotatePersonalizedRecommendationBatch(
  auth0Subject: string,
  expectedBatchId: string,
  limit = DEFAULT_BATCH_SIZE,
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    const userId = await lockUser(auth0Subject, transaction);
    const current = await loadActiveBatch(userId, transaction);
    if (!current) return createBatch(auth0Subject, userId, limit, transaction);
    if (current.id !== expectedBatchId || current.status === "exhausted") {
      return savedBatchResult(userId, current, transaction);
    }

    const prepared = await preparePersonalizedEmsRecommendations(
      auth0Subject,
      safeLimit(limit),
      transaction,
    );
    const selected = selectPreparedPersonalizedRecommendations(auth0Subject, prepared);
    if (!selected.recommendations.profileReady) {
      throw new Error("Recommendation profile became unavailable.");
    }
    await transaction.query(
      `UPDATE user_recommendation_batches
       SET status = 'replaced', replaced_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'current'`,
      [current.id, userId],
    );
    return insertBatch(
      userId,
      selected.recommendations,
      prepared.shadow,
      selected.serving,
      transaction,
    );
  });
}

export async function listPersonalizedRecommendationHistory(
  auth0Subject: string,
  limit = DEFAULT_HISTORY_LIMIT,
  executor?: TransactionExecutor,
): Promise<RecommendationHistoryEntry[]> {
  const database = executor ?? getDatabasePool();
  const safeHistoryLimit = Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.trunc(limit)));
  const result = await database.query<RecommendationBatchRow>(
    `SELECT batch.id, batch.status, batch.recommendations, batch.created_at
     FROM user_recommendation_batches AS batch
     INNER JOIN app_users AS user_row ON user_row.id = batch.user_id
     WHERE user_row.auth0_subject = $1 AND batch.status = 'replaced'
     ORDER BY batch.created_at DESC, batch.id DESC
     LIMIT $2`,
    [auth0Subject, safeHistoryLimit],
  );
  return result.rows.map((row) => {
    const recommendations = parseRecommendations(row.recommendations);
    return {
      batchId: row.id,
      createdAt: isoDate(row.created_at),
      rankingVersion: recommendations.rankingVersion,
      tracks: recommendations.tracks,
    };
  });
}
