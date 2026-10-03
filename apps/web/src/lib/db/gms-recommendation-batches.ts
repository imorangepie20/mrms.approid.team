import type { RecommendationServingDecision } from "@/lib/recommendations/serving";
import type { Track } from "@/lib/music/types";

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
const DEFAULT_HISTORY_PAGE_SIZE = 10;
const MAX_HISTORY_PAGE_SIZE = 24;

type RecommendationBatchRow = {
  created_at: Date | string;
  id: string;
  recommendations: unknown;
  status: "current" | "replaced" | "exhausted";
};

export type RecommendationHistoryEntry = {
  batchId: string;
  createdAt: string;
  profileVersion?: string | null;
  rankingVersion: "baseline" | "hybrid-v0";
  status: "current" | "replaced" | "exhausted";
  tracks: Array<{
    decidedAt: string | null;
    decision: "accept" | "reject" | "skip" | null;
    track: Track;
  }>;
};

export type RecommendationHistoryPage = {
  items: RecommendationHistoryEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
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
  batchId: string,
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
       AND decision IN ('accept', 'reject')
     UNION
     SELECT hidden.track_id AS source_track_id
     FROM user_recommendation_history_hidden_tracks AS hidden
     INNER JOIN user_recommendation_batches AS batch ON batch.id = hidden.batch_id
     WHERE batch.user_id = $1 AND hidden.batch_id = $3`,
    [userId, trackIds, batchId],
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
    row.id,
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

export async function hidePersonalizedRecommendationHistoryTrack(
  auth0Subject: string,
  batchId: string,
  trackId: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<{ found: boolean }>(
    `WITH owned_track AS (
       SELECT batch.id AS batch_id
       FROM user_recommendation_batches AS batch
       INNER JOIN app_users AS user_row ON user_row.id = batch.user_id
       WHERE user_row.auth0_subject = $1
         AND batch.id = $2
         AND $3::uuid = ANY(batch.track_ids)
     ), hidden AS (
       INSERT INTO user_recommendation_history_hidden_tracks (batch_id, track_id)
       SELECT batch_id, $3::uuid
       FROM owned_track
       ON CONFLICT (batch_id, track_id) DO NOTHING
       RETURNING batch_id
     )
     SELECT EXISTS(SELECT 1 FROM owned_track) AS found`,
    [auth0Subject, batchId, trackId],
  );
  return result.rows[0]?.found === true;
}

export async function getPersonalizedRecommendationHistoryPage(
  auth0Subject: string,
  page = 1,
  pageSize = DEFAULT_HISTORY_PAGE_SIZE,
  executor?: TransactionExecutor,
): Promise<RecommendationHistoryPage> {
  return loadRecommendationHistory(auth0Subject, page, pageSize, executor);
}

export async function getAllPersonalizedRecommendationHistory(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<RecommendationHistoryEntry[]> {
  return (await loadRecommendationHistory(auth0Subject, 1, DEFAULT_HISTORY_PAGE_SIZE, executor, true)).items;
}

export async function hidePersonalizedRecommendationHistoryBatch(
  auth0Subject: string,
  batchId: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<{ found: boolean }>(
    `WITH owned_batch AS (
       SELECT batch.id, batch.track_ids
       FROM user_recommendation_batches AS batch
       INNER JOIN app_users AS user_row ON user_row.id = batch.user_id
       WHERE user_row.auth0_subject = $1 AND batch.id = $2
     ), hidden_tracks AS (
       INSERT INTO user_recommendation_history_hidden_tracks (batch_id, track_id)
       SELECT owned.id, track_id FROM owned_batch AS owned
       CROSS JOIN LATERAL unnest(owned.track_ids) AS track_id
       ON CONFLICT (batch_id, track_id) DO NOTHING
     ), hidden_batch AS (
       INSERT INTO user_recommendation_history_hidden_batches (batch_id)
       SELECT id FROM owned_batch
       ON CONFLICT (batch_id) DO NOTHING
     )
     SELECT EXISTS(SELECT 1 FROM owned_batch) AS found`,
    [auth0Subject, batchId],
  );
  return result.rows[0]?.found === true;
}

async function loadRecommendationHistory(
  auth0Subject: string,
  page: number,
  pageSize: number,
  executor?: TransactionExecutor,
  all = false,
): Promise<RecommendationHistoryPage> {
  const database = executor ?? getDatabasePool();
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const safePageSize = Math.max(1, Math.min(MAX_HISTORY_PAGE_SIZE, Math.trunc(pageSize) || DEFAULT_HISTORY_PAGE_SIZE));
  const countResult = await database.query<{ total_count: number | string }>(
    `SELECT count(*) AS total_count
     FROM user_recommendation_batches AS batch
     INNER JOIN app_users AS user_row ON user_row.id = batch.user_id
     WHERE user_row.auth0_subject = $1
       AND NOT EXISTS (SELECT 1 FROM user_recommendation_history_hidden_batches AS hidden WHERE hidden.batch_id = batch.id)`,
    [auth0Subject],
  );
  const totalCount = Number(countResult.rows[0]?.total_count ?? 0);
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safePageSize);
  const effectivePage = totalPages === 0 ? 1 : Math.min(safePage, totalPages);
  const result = await database.query<RecommendationBatchRow>(
    `SELECT batch.id, batch.status, batch.recommendations, batch.created_at
     FROM user_recommendation_batches AS batch
     INNER JOIN app_users AS user_row ON user_row.id = batch.user_id
     WHERE user_row.auth0_subject = $1
       AND NOT EXISTS (SELECT 1 FROM user_recommendation_history_hidden_batches AS hidden WHERE hidden.batch_id = batch.id)
     ORDER BY batch.created_at DESC, batch.id DESC
     ${all ? "" : "LIMIT $2 OFFSET $3"}`,
    all ? [auth0Subject] : [auth0Subject, safePageSize, (effectivePage - 1) * safePageSize],
  );

  const parsedRows = result.rows.map((row) => ({
    row,
    recommendations: parseRecommendations(row.recommendations),
  }));
  const batchIds = parsedRows
    .filter(({ recommendations }) => recommendations.tracks.length > 0)
    .map(({ row }) => row.id);
  const hiddenTracks = batchIds.length === 0 ? { rows: [] } : await database.query<{
    batch_id: string;
    track_id: string;
  }>(
    `SELECT hidden.batch_id, hidden.track_id
     FROM user_recommendation_history_hidden_tracks AS hidden
     INNER JOIN user_recommendation_batches AS batch ON batch.id = hidden.batch_id
     INNER JOIN app_users AS user_row ON user_row.id = batch.user_id
     WHERE user_row.auth0_subject = $1
       AND hidden.batch_id = ANY($2::uuid[])`,
    [auth0Subject, batchIds],
  );
  const hiddenTrackKeys = new Set(hiddenTracks.rows.map(({ batch_id, track_id }) => `${batch_id}:${track_id}`));
  const visibleRows = parsedRows.map(({ row, recommendations }) => ({
    row,
    recommendations: {
      ...recommendations,
      tracks: recommendations.tracks.filter((track) => !hiddenTrackKeys.has(`${row.id}:${track.id}`)),
    },
  }));
  const trackIds = [...new Set(visibleRows.flatMap(({ recommendations }) =>
    recommendations.tracks.map((track) => track.id)))];
  const decisions = trackIds.length === 0 ? { rows: [] } : await database.query<{
    created_at: Date | string;
    decision: "accept" | "reject" | "skip";
    source_track_id: string;
  }>(
    `SELECT DISTINCT ON (decision.source_track_id)
       decision.source_track_id, decision.decision, decision.created_at
     FROM user_recommendation_decisions AS decision
     INNER JOIN app_users AS user_row ON user_row.id = decision.user_id
     WHERE user_row.auth0_subject = $1
       AND decision.source_track_id = ANY($2::uuid[])
     ORDER BY decision.source_track_id, decision.created_at DESC, decision.id DESC`,
    [auth0Subject, trackIds],
  );
  const decisionsByTrack = new Map(decisions.rows.map((decision) => [
    decision.source_track_id,
    { decidedAt: isoDate(decision.created_at), decision: decision.decision },
  ]));
  const items: RecommendationHistoryEntry[] = visibleRows.map(({ row, recommendations }) => {
    return {
      batchId: row.id,
      createdAt: isoDate(row.created_at),
      profileVersion: recommendations.profileVersion,
      rankingVersion: recommendations.rankingVersion,
      status: row.status,
      tracks: recommendations.tracks.map((track) => ({
        ...(decisionsByTrack.get(track.id) ?? { decidedAt: null, decision: null }),
        track,
      })),
    };
  });
  return {
    items,
    page: effectivePage,
    pageSize: safePageSize,
    totalCount,
    totalPages,
  };
}
