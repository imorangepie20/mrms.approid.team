import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./music-library";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  select: vi.fn(),
}));

vi.mock("./gms-recommendations", () => ({
  preparePersonalizedEmsRecommendations: mocks.prepare,
  selectPreparedPersonalizedRecommendations: mocks.select,
}));

import {
  getPersonalizedRecommendationHistoryPage,
  getAllPersonalizedRecommendationHistory,
  hidePersonalizedRecommendationHistoryBatch,
  getOrCreatePersonalizedRecommendationBatch,
  hidePersonalizedRecommendationHistoryTrack,
  rotatePersonalizedRecommendationBatch,
} from "./gms-recommendation-batches";

const userId = "d103da79-c7a9-4ab6-8202-2fbd9b4adf01";
const batchId = "f17870e2-b297-4451-adf5-9856f257b720";
const nextBatchId = "8acb99e4-78ba-410c-aefd-e1638be9fbb8";
const trackId = "c2f2103a-b909-498a-8c5c-3aec030b63be";
const nextTrackId = "a2870149-66ad-430c-b662-45b156111582";

function recommendations(id = trackId) {
  return {
    profileReady: true,
    profileVersion: "ems-v1",
    rankingVersion: "baseline" as const,
    tracks: [{
      album: "Album",
      artist: "Artist",
      artworkClass: "from-violet-700 to-slate-900",
      artworkUrl: "",
      id,
      playbackAvailable: true,
      recommendation: {
        rankingVersion: "baseline" as const,
        reasonCodes: ["taste_match"],
        score: 0.9,
        scoreComponents: {
          catalogPriority: 0.8,
          diversity: 1,
          freshness: 0.7,
          matchConfidence: 0.9,
          similarity: 0.9,
        },
      },
      tidalTrackId: `tidal-${id}`,
      title: "Track",
    }],
  };
}

function executor(handler: (sql: string, values?: unknown[]) => { rows: unknown[] }) {
  return {
    query: vi.fn(async <Row extends Record<string, unknown>>(sql: string, values?: unknown[]) =>
      handler(sql, values) as { rows: Row[] }),
  } as TransactionExecutor & { query: ReturnType<typeof vi.fn> };
}

describe("persistent recommendation batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepare.mockResolvedValue({ shadow: null });
    mocks.select.mockReturnValue({
      recommendations: recommendations(nextTrackId),
      serving: {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
    });
  });

  it("returns the same persisted current batch without recomputing recommendations", async () => {
    const database = executor((sql) => {
      if (sql.includes("FROM app_users")) return { rows: [{ id: userId }] };
      if (sql.includes("FROM user_recommendation_batches")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("FROM user_recommendation_decisions")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await getOrCreatePersonalizedRecommendationBatch(
      "auth0|listener",
      12,
      database,
    );

    expect(result.batchId).toBe(batchId);
    expect(result.recommendations.tracks.map((track) => track.id)).toEqual([trackId]);
    expect(result.newlyCreated).toBe(false);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("hides decided tracks from the current view while retaining its stored snapshot", async () => {
    const database = executor((sql) => {
      if (sql.includes("FROM app_users")) return { rows: [{ id: userId }] };
      if (sql.includes("FROM user_recommendation_batches")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("FROM user_recommendation_decisions")) {
        return { rows: [{ source_track_id: trackId }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await getOrCreatePersonalizedRecommendationBatch(
      "auth0|listener",
      12,
      database,
    );

    expect(result.recommendations.tracks).toEqual([]);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("treats a stale refresh as idempotent and does not consume another batch", async () => {
    const database = executor((sql) => {
      if (sql.includes("FROM app_users")) return { rows: [{ id: userId }] };
      if (sql.includes("FROM user_recommendation_batches")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("FROM user_recommendation_decisions")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await rotatePersonalizedRecommendationBatch(
      "auth0|listener",
      "7d819bd1-b80a-4756-b45c-efc6fc89de48",
      12,
      database,
    );

    expect(result.batchId).toBe(batchId);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("replaces the current batch and records every newly exposed track atomically", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const database = executor((sql, values) => {
      queries.push({ sql, values });
      if (sql.includes("FROM app_users")) return { rows: [{ id: userId }] };
      if (sql.includes("FROM user_recommendation_batches")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("UPDATE user_recommendation_batches")) return { rows: [] };
      if (sql.includes("INSERT INTO user_recommendation_batches")) {
        return { rows: [{ created_at: "2026-09-29T01:00:00.000Z", id: nextBatchId }] };
      }
      if (sql.includes("INSERT INTO user_recommendation_exposures")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await rotatePersonalizedRecommendationBatch(
      "auth0|listener",
      batchId,
      12,
      database,
    );

    expect(result.batchId).toBe(nextBatchId);
    expect(result.newlyCreated).toBe(true);
    expect(mocks.prepare).toHaveBeenCalledWith("auth0|listener", 12, database);
    expect(queries.find((query) => query.sql.includes("INSERT INTO user_recommendation_exposures"))?.values)
      .toEqual([userId, nextBatchId, "baseline", [nextTrackId]]);
  });

  it("persists exhaustion without recycling or creating an exposure", async () => {
    mocks.select.mockReturnValue({
      recommendations: { ...recommendations(), tracks: [] },
      serving: {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
    });
    const queries: string[] = [];
    const database = executor((sql) => {
      queries.push(sql);
      if (sql.includes("FROM app_users")) return { rows: [{ id: userId }] };
      if (sql.includes("FROM user_recommendation_batches")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("UPDATE user_recommendation_batches")) return { rows: [] };
      if (sql.includes("INSERT INTO user_recommendation_batches")) {
        return { rows: [{ created_at: "2026-09-29T01:00:00.000Z", id: nextBatchId }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await rotatePersonalizedRecommendationBatch(
      "auth0|listener",
      batchId,
      12,
      database,
    );

    expect(result.exhausted).toBe(true);
    expect(queries.some((sql) => sql.includes("INSERT INTO user_recommendation_exposures"))).toBe(false);
  });

  it("paginates every recommendation batch and joins the user's latest track decisions", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const database = executor((sql, values) => {
      queries.push({ sql, values });
      if (sql.includes("count(*)")) return { rows: [{ total_count: "12" }] };
      if (sql.includes("SELECT batch.id")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("FROM user_recommendation_history_hidden_tracks")) return { rows: [] };
      if (sql.includes("DISTINCT ON")) return { rows: [{
        created_at: "2026-09-29T01:00:00.000Z",
        decision: "accept",
        source_track_id: trackId,
      }] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await getPersonalizedRecommendationHistoryPage(
      "auth0|listener",
      2,
      10,
      database,
    );

    expect(result).toMatchObject({ page: 2, pageSize: 10, totalCount: 12, totalPages: 2 });
    expect(result.items[0]).toMatchObject({
      batchId,
      status: "current",
      tracks: [{
        decidedAt: "2026-09-29T01:00:00.000Z",
        decision: "accept",
        track: { id: trackId },
      }],
    });
    expect(queries.find(({ sql }) => sql.includes("SELECT batch.id"))?.values)
      .toEqual(["auth0|listener", 10, 10]);
    expect(queries.find(({ sql }) => sql.includes("FROM user_recommendation_history_hidden_tracks"))?.values)
      .toEqual(["auth0|listener", [batchId]]);
    expect(queries.find(({ sql }) => sql.includes("DISTINCT ON"))?.values)
      .toEqual(["auth0|listener", [trackId]]);
  });

  it("filters a hidden track from history without querying or changing its decision evidence", async () => {
    const queries: string[] = [];
    const database = executor((sql) => {
      queries.push(sql);
      if (sql.includes("count(*)")) return { rows: [{ total_count: 1 }] };
      if (sql.includes("SELECT batch.id")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: recommendations(),
        status: "current",
      }] };
      if (sql.includes("FROM user_recommendation_history_hidden_tracks")) {
        return { rows: [{ batch_id: batchId, track_id: trackId }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await getPersonalizedRecommendationHistoryPage(
      "auth0|listener",
      1,
      10,
      database,
    );

    expect(result.items[0]?.tracks).toEqual([]);
    expect(queries.some((sql) => sql.includes("user_recommendation_decisions"))).toBe(false);
  });

  it("creates a user-scoped history tombstone idempotently", async () => {
    const database = executor((sql, values) => {
      expect(sql).toContain("WITH owned_track AS");
      expect(sql).toContain("ON CONFLICT (batch_id, track_id) DO NOTHING");
      expect(values).toEqual(["auth0|listener", batchId, trackId]);
      return { rows: [{ found: true }] };
    });

    await expect(hidePersonalizedRecommendationHistoryTrack(
      "auth0|listener",
      batchId,
      trackId,
      database,
    )).resolves.toBe(true);
  });

  it("refuses to hide a track outside the authenticated user's owned batch", async () => {
    const database = executor(() => ({ rows: [{ found: false }] }));

    await expect(hidePersonalizedRecommendationHistoryTrack(
      "auth0|listener",
      batchId,
      trackId,
      database,
    )).resolves.toBe(false);
  });

  it("normalizes invalid history pagination and skips decision lookup for an exhausted batch", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const database = executor((sql, values) => {
      queries.push({ sql, values });
      if (sql.includes("count(*)")) return { rows: [{ total_count: 1 }] };
      if (sql.includes("SELECT batch.id")) return { rows: [{
        created_at: "2026-09-29T00:00:00.000Z",
        id: batchId,
        recommendations: { ...recommendations(), tracks: [] },
        status: "exhausted",
      }] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await getPersonalizedRecommendationHistoryPage(
      "auth0|listener",
      Number.NaN,
      999,
      database,
    );

    expect(result).toMatchObject({ page: 1, pageSize: 24, totalPages: 1 });
    expect(result.items[0]).toMatchObject({ status: "exhausted", tracks: [] });
    expect(queries).toHaveLength(2);
  });

  it("clamps a history page beyond the last page", async () => {
    const database = executor((sql, values) => {
      if (sql.includes("count(*)")) return { rows: [{ total_count: 12 }] };
      if (sql.includes("SELECT batch.id")) {
        expect(values).toEqual(["auth0|listener", 10, 10]);
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await getPersonalizedRecommendationHistoryPage(
      "auth0|listener",
      999,
      10,
      database,
    );

    expect(result).toMatchObject({ page: 2, totalPages: 2 });
  });
});

it("loads more than 24 groups without pagination and excludes hidden groups in SQL", async () => {
  const database=executor((sql,values)=>{
    if(sql.includes("count(*)")) return {rows:[{total_count:25}]};
    if(sql.includes("SELECT batch.id")) {
      expect(sql).not.toContain("LIMIT");
      expect(sql).toContain("NOT EXISTS (SELECT 1 FROM user_recommendation_history_hidden_batches");
      expect(sql).toContain("ORDER BY batch.created_at DESC, batch.id DESC");
      expect(values).toEqual(["auth0|listener"]);
      return {rows:Array.from({length:25},(_,i)=>({id:`batch-${i}`,created_at:"2026-10-04T00:00:00Z",status:"replaced",recommendations:recommendations()}))};
    }
    return {rows:[]};
  });
  expect(await getAllPersonalizedRecommendationHistory("auth0|listener",database)).toHaveLength(25);
});
it("hides a group and all its tracks atomically without modifying original evidence", async () => {
  const database=executor((sql,values)=>{
    expect(sql).toContain("WITH owned_batch AS");
    expect(sql).toContain("user_row.auth0_subject = $1 AND batch.id = $2");
    expect(sql).toContain("INSERT INTO user_recommendation_history_hidden_batches");
    expect(sql).toContain("INSERT INTO user_recommendation_history_hidden_tracks");
    expect(sql).toContain("ON CONFLICT (batch_id) DO NOTHING");
    expect(sql).not.toMatch(/DELETE FROM|UPDATE user_recommendation/);
    expect(values).toEqual(["auth0|listener",batchId]);
    return {rows:[{found:true}]};
  });
  expect(await hidePersonalizedRecommendationHistoryBatch("auth0|listener",batchId,database)).toBe(true);
  expect(database.query).toHaveBeenCalledTimes(1);
});
