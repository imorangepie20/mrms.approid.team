import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/026_recommendation_serving_provenance.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/026_recommendation_serving_provenance.down.sql");

describe("026 recommendation serving provenance migration", () => {
  it("records requested and served ranking without exposing cohort configuration", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/ALTER TABLE user_recommendation_shadow_runs/i);
    expect(sql).toMatch(/requested_ranking_version TEXT NOT NULL DEFAULT 'baseline'/i);
    expect(sql).toMatch(/served_ranking_version TEXT NOT NULL DEFAULT 'baseline'/i);
    expect(sql).toMatch(/minimum_audio_coverage DOUBLE PRECISION/i);
    expect(sql).toMatch(/serving_fallback_reason TEXT/i);
    expect(sql).toMatch(/ALTER TABLE user_recommendation_decisions/i);
    expect(sql).toMatch(/ranking_version TEXT NOT NULL DEFAULT 'baseline'/i);
    expect(sql).toMatch(/CHECK \(ranking_version IN \('baseline', 'hybrid-v0'\)\)/i);
    expect(sql).not.toMatch(/auth0_subject|hybrid_auth0_subjects|embedding|preview_url|token/i);
  });

  it("rolls back only additive serving provenance columns", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP COLUMN IF EXISTS requested_ranking_version/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS served_ranking_version/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS ranking_version/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
