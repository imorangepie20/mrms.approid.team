import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/024_user_audio_taste_profiles.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/024_user_audio_taste_profiles.down.sql");

describe("024 user audio taste profiles migration", () => {
  it("keeps user-scoped audio profiles separate from 768-dimensional text profiles", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE user_audio_taste_profiles/i);
    expect(sql).toMatch(/user_id UUID NOT NULL REFERENCES app_users\(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(/profile_version UUID NOT NULL/i);
    expect(sql).toMatch(/eligible_track_count INTEGER NOT NULL/i);
    expect(sql).toMatch(/analyzed_track_count INTEGER NOT NULL/i);
    expect(sql).toMatch(/coverage_ratio DOUBLE PRECISION GENERATED ALWAYS AS/i);
    expect(sql).toMatch(/input_fingerprint CHAR\(64\)/i);
    expect(sql).toMatch(/summary_features JSONB NOT NULL/i);
    expect(sql).toMatch(/prediction_features JSONB NOT NULL/i);
    expect(sql).toMatch(/CREATE TABLE user_audio_taste_centroids/i);
    expect(sql).toMatch(/embedding vector\(2304\) NOT NULL/i);
    expect(sql).toMatch(/CHECK \(vector_dims\(embedding\) = 2304\)/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+(user_taste_profiles|user_taste_centroids)/i);
  });

  it("rolls back only the audio profile tables in dependency order", async () => {
    const sql = await readFile(rollbackPath, "utf8");
    const centroids = sql.search(/DROP TABLE IF EXISTS user_audio_taste_centroids/i);
    const profiles = sql.search(/DROP TABLE IF EXISTS user_audio_taste_profiles/i);

    expect(centroids).toBeGreaterThanOrEqual(0);
    expect(centroids).toBeLessThan(profiles);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(user_taste_profiles|user_taste_centroids|ems_tracks)/i);
  });
});
