import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/029_recommendation_batches.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/029_recommendation_batches.down.sql");

describe("029 recommendation batches migration", () => {
  it("stores one active batch and permanent user-scoped exposure history", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE user_recommendation_batches/i);
    expect(sql).toMatch(/status IN \('current', 'replaced', 'exhausted'\)/i);
    expect(sql).toMatch(/recommendations JSONB NOT NULL/i);
    expect(sql).toMatch(/WHERE status IN \('current', 'exhausted'\)/i);
    expect(sql).toMatch(/CREATE TABLE user_recommendation_exposures/i);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, track_id\)/i);
    expect(sql).toMatch(/REFERENCES user_recommendation_batches\(id, user_id\) ON DELETE CASCADE/i);
    expect(sql).not.toMatch(/track_id UUID NOT NULL REFERENCES ems_tracks/i);
    expect(sql).not.toMatch(/retention|prune|expires_at/i);
  });

  it("rolls back only recommendation batch tables in dependency order", async () => {
    const sql = await readFile(rollbackPath, "utf8");
    const exposures = sql.search(/DROP TABLE IF EXISTS user_recommendation_exposures/i);
    const batches = sql.search(/DROP TABLE IF EXISTS user_recommendation_batches/i);

    expect(exposures).toBeGreaterThanOrEqual(0);
    expect(exposures).toBeLessThan(batches);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(app_users|ems_tracks)/i);
  });
});
