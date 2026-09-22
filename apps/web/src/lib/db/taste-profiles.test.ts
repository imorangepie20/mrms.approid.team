import { describe, expect, it, vi } from "vitest";

import type { TasteProfileResult } from "@/lib/recommendations/taste-profile";

import {
  loadCompletedTasteProfileInputs,
  replaceTasteProfile,
} from "./taste-profiles";
import type { TransactionExecutor } from "./music-library";

const metadata = {
  algorithmVersion: "taste-v1",
  modelId: "model-a",
  modelRevision: "revision-a",
};

const profile: TasteProfileResult = {
  centroids: [
    {
      clusterIndex: 0,
      embedding: [0.6, 0.8],
      trackCount: 15,
      weight: 1,
    },
    {
      clusterIndex: 1,
      embedding: [1, 0],
      trackCount: 10,
      weight: 0.7,
    },
  ],
  uniqueTrackCount: 15,
};

function executor(options: { failCentroid?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (sql.includes("INSERT INTO user_taste_profiles")) {
      return { rows: [{ id: "profile-a" }] };
    }
    if (options.failCentroid && sql.includes("INSERT INTO user_taste_centroids")) {
      throw new Error("centroid write failed");
    }
    return { rows: [] };
  });
  return { database: { query } as unknown as TransactionExecutor, query };
}

describe("taste profile repository", () => {
  it("atomically replaces centroids and exposes completed state only at commit", async () => {
    const { database, query } = executor();

    await replaceTasteProfile("auth0|listener", profile, metadata, database);

    const sql = query.mock.calls.map(([text]) => text);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql.findIndex((text) => text.includes("status = 'building'")))
      .toBeLessThan(sql.findIndex((text) => text.includes("status = 'completed'")));
    expect(sql.findIndex((text) => text.includes("status = 'completed'")))
      .toBeLessThan(sql.indexOf("COMMIT"));
    expect(sql).toEqual(expect.arrayContaining([
      expect.stringMatching(/DELETE FROM user_taste_centroids/i),
      expect.stringMatching(/INSERT INTO user_taste_centroids/i),
    ]));
  });

  it("rolls back the whole replacement when a centroid write fails", async () => {
    const { database, query } = executor({ failCentroid: true });

    await expect(
      replaceTasteProfile("auth0|listener", profile, metadata, database),
    ).rejects.toThrow("centroid write failed");

    const sql = query.mock.calls.map(([text]) => text);
    expect(sql).toContain("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
  });

  it("scopes the profile owner to the Auth0 subject", async () => {
    const { database, query } = executor();

    await replaceTasteProfile("auth0|listener-b", profile, metadata, database);

    const upsert = query.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO user_taste_profiles"),
    );
    expect(upsert?.[0]).toMatch(/WHERE u\.auth0_subject = \$1/i);
    expect(upsert?.[1]?.[0]).toBe("auth0|listener-b");
  });

  it("always writes the global centroid at cluster index zero", async () => {
    const { database, query } = executor();

    await replaceTasteProfile("auth0|listener", profile, metadata, database);

    const inserts = query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO user_taste_centroids"),
    );
    expect(inserts[0]?.[1]).toEqual([
      "profile-a",
      0,
      15,
      1,
      "[0.6,0.8]",
    ]);
  });

  it("loads only completed vectors owned by the requesting user", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void sql;
      void values;
      return {
        rows: [{
          artist_name: "Daft Punk",
          embedding: "[0.6,0.8]",
          playlist_count: 2,
          track_id: "track-a",
        }],
      };
    });

    await expect(loadCompletedTasteProfileInputs(
      "auth0|listener",
      { query } as unknown as TransactionExecutor,
    )).resolves.toEqual([{
      artist: "Daft Punk",
      embedding: [0.6, 0.8],
      playlistCount: 2,
      trackId: "track-a",
    }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /u\.auth0_subject = \$1[\s\S]*e\.status = 'completed'/i,
      ),
      ["auth0|listener"],
    );
  });
});
