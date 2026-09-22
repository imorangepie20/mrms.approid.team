import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationDirectory = dirname(fileURLToPath(import.meta.url));
const up = readFileSync(join(migrationDirectory, "008_ems_catalog.sql"), "utf8");
const down = readFileSync(join(migrationDirectory, "008_ems_catalog.down.sql"), "utf8");

describe("EMS catalog migration contract", () => {
  it("defines isolated ingest and EMS tables with the approved status boundaries", () => {
    expect(up).toMatch(/CREATE TABLE ems_ingest_runs/i);
    expect(up).toMatch(/CREATE TABLE ems_ingest_candidates/i);
    expect(up).toMatch(/CREATE TABLE ems_tracks/i);
    expect(up).toMatch(/CREATE TABLE ems_track_sources/i);
    expect(up).toMatch(/CREATE TABLE ems_availability_events/i);
    expect(up).toMatch(/CREATE TABLE ems_track_embeddings/i);
    expect(up).toMatch(/CREATE TABLE user_recommendation_decisions/i);
    expect(up).toMatch(/candidate[\s\S]*active[\s\S]*stale[\s\S]*inactive[\s\S]*rejected/);
    expect(up).toMatch(/FOR UPDATE|SKIP LOCKED|lease_expires_at/i);
    expect(up).not.toMatch(/DROP TABLE|ALTER TABLE\s+(music_tracks|track_embeddings)/i);
  });

  it("removes only the EMS objects in reverse dependency order", () => {
    expect(down).toMatch(/DROP TABLE IF EXISTS ems_track_embeddings/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS user_recommendation_decisions/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS ems_availability_events/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS ems_track_sources/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS ems_tracks/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS ems_ingest_candidates/i);
    expect(down).toMatch(/DROP TABLE IF EXISTS ems_ingest_runs/i);
    expect(down).not.toMatch(/DROP TABLE IF EXISTS\s+(music_tracks|track_embeddings)/i);
  });
});
