import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/025_recommendation_shadow_runs.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/025_recommendation_shadow_runs.down.sql");

describe("025 recommendation shadow runs migration", () => {
  it("stores user-scoped run provenance and bounded aggregate metrics", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE user_recommendation_shadow_runs/i);
    expect(sql).toMatch(/user_id UUID NOT NULL REFERENCES app_users\(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(/text_profile_id UUID NOT NULL REFERENCES user_taste_profiles\(id\)/i);
    expect(sql).toMatch(/audio_profile_id UUID REFERENCES user_audio_taste_profiles\(id\)/i);
    expect(sql).toMatch(/ranking_version TEXT NOT NULL CHECK \(ranking_version = 'hybrid-v0'\)/i);
    expect(sql).toMatch(/overlap_at_k DOUBLE PRECISION NOT NULL/i);
    expect(sql).toMatch(/fallback_used BOOLEAN NOT NULL/i);
    expect(sql).toMatch(/CREATE TABLE user_recommendation_shadow_candidates/i);
    expect(sql).toMatch(/components JSONB NOT NULL/i);
    expect(sql).toMatch(/reason_codes JSONB NOT NULL/i);
    expect(sql).not.toMatch(/embedding vector/i);
  });

  it("rolls back only shadow observation tables in dependency order", async () => {
    const sql = await readFile(rollbackPath, "utf8");
    const candidates = sql.search(/DROP TABLE IF EXISTS user_recommendation_shadow_candidates/i);
    const runs = sql.search(/DROP TABLE IF EXISTS user_recommendation_shadow_runs/i);

    expect(candidates).toBeGreaterThanOrEqual(0);
    expect(candidates).toBeLessThan(runs);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(user_taste_profiles|user_audio_taste_profiles|ems_tracks)/i);
  });
});
