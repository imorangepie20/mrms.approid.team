import { describe, expect, it, vi } from "vitest";

import {
  claimEmbeddingJobs,
  completeEmbeddingJobs,
  countFailedEmbeddingJobs,
  countPendingEmbeddingJobs,
  retryEmbeddingJobs,
  syncEmbeddingJobs,
} from "./embeddings";
import type { TransactionExecutor } from "./music-library";

const model = { modelId: "model-a", modelRevision: "rev-a" };
const vocabulary = ["house", "disco", "jazz"];

function trackRow(overrides: Record<string, unknown> = {}) {
  return {
    album_name: "Discovery",
    artist_name: "Daft Punk",
    id: "track-a",
    mb_genres: ["house", "disco"],
    mb_tags: [],
    playlist_count: 2,
    title: "One More Time",
    ...overrides,
  };
}

describe("embedding job repository", () => {
  it("creates one job per unique user track and hashes model revision plus input", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void values;
      return sql.includes("SELECT")
        ? { rows: [trackRow()] }
        : { rows: [] };
    });

    await syncEmbeddingJobs(
      "auth0|listener-a",
      model,
      vocabulary,
      { query } as unknown as TransactionExecutor,
    );

    const selectSql = query.mock.calls[0]?.[0] ?? "";
    expect(selectSql).toMatch(/count\(DISTINCT p\.id\)::integer AS playlist_count/i);
    expect(selectSql).toMatch(/GROUP BY\s+t\.id/i);
    const inserts = query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO track_embeddings"),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]).toEqual([
      "track-a",
      "model-a",
      "rev-a",
      "6ae86328f61420f9964e8d877eb51b91dce58d05f5b012056255b21fb55a7b94",
      "One More Time | Daft Punk | Discovery | house, disco",
    ]);
  });

  it("does not claim another user's jobs", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void sql;
      void values;
      return { rows: [] };
    });

    await expect(
      claimEmbeddingJobs(
        "auth0|listener-b",
        16,
        { query } as unknown as TransactionExecutor,
      ),
    ).resolves.toEqual([]);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /INNER JOIN app_users AS u[\s\S]*u\.auth0_subject = \$1/i,
      ),
      ["auth0|listener-b", 16],
    );
  });

  it("claims at most 16 jobs with FOR UPDATE SKIP LOCKED", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void sql;
      void values;
      return { rows: [{
        attempt_count: 1,
        input_hash: "hash-a",
        input_text: "text-a",
        track_id: "track-a",
      }] };
    });

    await expect(
      claimEmbeddingJobs(
        "auth0|listener-a",
        99,
        { query } as unknown as TransactionExecutor,
      ),
    ).resolves.toEqual([{
      attemptCount: 1,
      inputHash: "hash-a",
      inputText: "text-a",
      trackId: "track-a",
    }]);

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(/FOR UPDATE OF e SKIP LOCKED/i);
    expect(sql).toMatch(/ORDER BY e\.updated_at, e\.track_id/i);
    expect(values).toEqual(["auth0|listener-a", 16]);
  });

  it("does not reset a completed job when its hash is unchanged", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void values;
      return sql.includes("SELECT") ? { rows: [trackRow()] } : { rows: [] };
    });

    await syncEmbeddingJobs(
      "auth0|listener-a",
      model,
      vocabulary,
      { query } as unknown as TransactionExecutor,
    );

    const upsert = query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO track_embeddings"),
    )?.[0] ?? "";
    expect(upsert).toMatch(
      /WHEN track_embeddings\.model_id = EXCLUDED\.model_id[\s\S]*track_embeddings\.model_revision = EXCLUDED\.model_revision[\s\S]*track_embeddings\.input_hash = EXCLUDED\.input_hash[\s\S]*THEN track_embeddings\.status/i,
    );
    expect(upsert).toMatch(/THEN track_embeddings\.embedding[\s\S]*ELSE NULL/i);
  });

  it("resets a completed job when genres change the hash", async () => {
    let genres = ["house", "disco"];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void values;
      return sql.includes("SELECT")
        ? { rows: [trackRow({ mb_genres: genres })] }
        : { rows: [] };
    });
    const database = { query } as unknown as TransactionExecutor;

    await syncEmbeddingJobs("auth0|listener-a", model, vocabulary, database);
    genres = ["jazz"];
    await syncEmbeddingJobs("auth0|listener-a", model, vocabulary, database);

    const upserts = query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO track_embeddings"),
    );
    expect(upserts.map(([, values]) => values?.[3])).toEqual([
      "6ae86328f61420f9964e8d877eb51b91dce58d05f5b012056255b21fb55a7b94",
      "f2107904bd5e5f4784614de700011836a6859a03f0c5108c14d5d2309c84800f",
    ]);
    expect(upserts[1]?.[0]).toMatch(/ELSE 'pending'/i);
  });

  it("completes, retries, and counts jobs only through the owning user", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void values;
      return { rows: sql.includes("count(*)") ? [{ count: 3 }] : [] };
    });
    const database = { query } as unknown as TransactionExecutor;
    const job = {
      attemptCount: 1,
      inputHash: "hash-a",
      inputText: "text-a",
      trackId: "track-a",
    };

    await completeEmbeddingJobs(
      "auth0|listener-a",
      [{ ...job, embedding: [1, 0] }],
      database,
    );
    await retryEmbeddingJobs(
      "auth0|listener-a",
      [job],
      "embedding_service_unavailable",
      database,
    );
    await expect(
      countPendingEmbeddingJobs("auth0|listener-a", database),
    ).resolves.toBe(3);
    await expect(
      countFailedEmbeddingJobs("auth0|listener-a", database),
    ).resolves.toBe(3);

    const allSql = query.mock.calls.map(([sql]) => sql).join("\n");
    expect(allSql.match(/u\.auth0_subject = \$1/g)).toHaveLength(4);
    expect(allSql).toMatch(/embedding = \$4::vector/i);
    expect(allSql).toMatch(/status = CASE WHEN e\.attempt_count >= 5 THEN 'failed' ELSE 'pending' END/i);
    expect(allSql).toMatch(/e\.status = 'failed'/i);
  });
});
