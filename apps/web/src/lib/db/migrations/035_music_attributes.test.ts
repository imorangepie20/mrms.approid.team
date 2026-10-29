import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/035_music_attributes.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/035_music_attributes.down.sql");

describe("music attributes migration", () => {
  it("stores shared attributes without user identity", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE music_artist_attributes/i);
    expect(sql).toMatch(/CREATE TABLE ems_track_attributes/i);
    expect(sql).toMatch(/CREATE TABLE music_track_attributes/i);
    const artistBlock = sql.match(/CREATE TABLE music_artist_attributes \([\s\S]*?\n\);/i)?.[0] ?? "";
    expect(artistBlock).not.toBe("");
    expect(artistBlock).not.toMatch(/user_id/i);
  });

  it("allows baseline-v2 everywhere ranking is recorded", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql.match(/'baseline-v2'/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql).not.toMatch(/user_recommendation_shadow_runs_ranking_version_check/);
  });

  it("allows attribute_profile_unavailable as a serving fallback reason", async () => {
    const up = await readFile(migrationPath, "utf8");
    const down = await readFile(rollbackPath, "utf8");

    expect(up).toMatch(/user_recommendation_shadow_runs_serving_fallback_reason_check[\s\S]*'attribute_profile_unavailable'/);
    expect(down).toMatch(/user_recommendation_shadow_runs_serving_fallback_reason_check/);
    expect(down).not.toMatch(/attribute_profile_unavailable/);
  });

  it("registers both routines", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/'lastfm_artist_tags'/);
    expect(sql).toMatch(/'music_attributes'/);
  });

  it("rolls back only new objects", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP TABLE IF EXISTS ems_track_attributes/i);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(ems_tracks|music_tracks)\b/i);
  });
});
