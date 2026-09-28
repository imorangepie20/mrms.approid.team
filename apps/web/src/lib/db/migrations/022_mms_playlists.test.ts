import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/022_mms_playlists.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/022_mms_playlists.down.sql");

describe("022 MMS playlists migration", () => {
  it("creates isolated user playlists with ownership, order, and duplicate constraints", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE mms_playlists/i);
    expect(sql).toMatch(/user_id UUID NOT NULL REFERENCES app_users\(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(/CREATE TABLE mms_playlist_tracks/i);
    expect(sql).toMatch(/playlist_id UUID NOT NULL REFERENCES mms_playlists\(id\) ON DELETE CASCADE/i);
    expect(sql).toMatch(/UNIQUE \(playlist_id, track_key\)/i);
    expect(sql).toMatch(/UNIQUE \(playlist_id, position\)/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+(user_playlists|user_playlist_tracks|music_tracks|ems_tracks)/i);
  });

  it("rolls back only the MMS playlist tables", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP TABLE IF EXISTS mms_playlist_tracks/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS mms_playlists/i);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(user_playlists|music_tracks|ems_tracks)/i);
  });
});
