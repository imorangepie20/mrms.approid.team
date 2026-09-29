import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/030_recommendation_history_hidden_tracks.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/030_recommendation_history_hidden_tracks.down.sql");

describe("030 recommendation history hidden tracks migration", () => {
  it("stores batch-scoped history tombstones without deleting recommendation evidence", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE user_recommendation_history_hidden_tracks/i);
    expect(sql).toMatch(/PRIMARY KEY \(batch_id, track_id\)/i);
    expect(sql).toMatch(/REFERENCES user_recommendation_batches\(id\) ON DELETE CASCADE/i);
    expect(sql).not.toMatch(/REFERENCES ems_tracks/i);
    expect(sql).not.toMatch(/DELETE FROM user_recommendation_(?:batches|exposures)/i);
  });

  it("rolls back only the history tombstone table", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP TABLE IF EXISTS user_recommendation_history_hidden_tracks/i);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(user_recommendation_batches|user_recommendation_exposures|app_users)/i);
  });
});
