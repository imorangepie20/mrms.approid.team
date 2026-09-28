import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/023_ems_audio_analysis.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/023_ems_audio_analysis.down.sql");

describe("023 EMS audio analysis migration", () => {
  it("creates bounded jobs and versioned analysis result tables", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE ems_track_audio_jobs/i);
    expect(sql).toMatch(/pending[\s\S]*running[\s\S]*completed[\s\S]*retryable[\s\S]*failed/i);
    expect(sql).toMatch(/lease_expires_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/CREATE TABLE ems_track_audio_features/i);
    expect(sql).toMatch(/CREATE TABLE ems_track_audio_embeddings/i);
    expect(sql).toMatch(/embedding vector\(2304\) NOT NULL/i);
    expect(sql).toMatch(/CHECK \(vector_dims\(embedding\) = dimensions\)/i);
    expect(sql).toMatch(/CREATE TABLE ems_track_audio_predictions/i);
    expect(sql).not.toMatch(/INSERT INTO ems_track_audio_jobs/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+(music_tracks|track_embeddings)/i);
  });

  it("rolls back only the audio analysis tables in reverse dependency order", async () => {
    const sql = await readFile(rollbackPath, "utf8");
    const prediction = sql.search(/DROP TABLE IF EXISTS ems_track_audio_predictions/i);
    const embedding = sql.search(/DROP TABLE IF EXISTS ems_track_audio_embeddings/i);
    const features = sql.search(/DROP TABLE IF EXISTS ems_track_audio_features/i);
    const jobs = sql.search(/DROP TABLE IF EXISTS ems_track_audio_jobs/i);

    expect(prediction).toBeGreaterThanOrEqual(0);
    expect(prediction).toBeLessThan(embedding);
    expect(embedding).toBeLessThan(features);
    expect(features).toBeLessThan(jobs);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(ems_tracks|music_tracks|track_embeddings)/i);
  });
});
