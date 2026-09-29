import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "src/lib/db/migrations/028_hybrid_full_coverage_retention.sql",
);
const rollbackPath = join(
  process.cwd(),
  "src/lib/db/migrations/028_hybrid_full_coverage_retention.down.sql",
);

describe("028 hybrid full coverage and shadow retention migration", () => {
  it("allows the fail-closed component fallback reason", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/component_coverage_incomplete/i);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS user_recommendation_shadow_runs_serving_fallback_reason_check/i);
  });

  it("provides preview and user-scoped pruning with candidate cascade", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE FUNCTION recommendation_shadow_cleanup_candidates/i);
    expect(sql).toMatch(/row_number\(\) OVER \([\s\S]*PARTITION BY user_id/i);
    expect(sql).toMatch(/created_at < statement_timestamp\(\)[\s\S]*make_interval\(days => p_retention_days\)/i);
    expect(sql).toMatch(/CREATE FUNCTION prune_recommendation_shadow_runs/i);
    expect(sql).toMatch(/DELETE FROM user_recommendation_shadow_runs/i);
    expect(sql).not.toMatch(/DELETE FROM\s+(user_recommendation_decisions|user_taste_profiles|ems_tracks)/i);
  });

  it("removes only the new functions and restores the prior fallback contract", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP FUNCTION IF EXISTS prune_recommendation_shadow_runs/i);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS recommendation_shadow_cleanup_candidates/i);
    expect(sql).toMatch(/audio_coverage_below_threshold/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
