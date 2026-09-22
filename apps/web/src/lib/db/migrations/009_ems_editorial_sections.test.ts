import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const up = readFileSync(join(root, "009_ems_editorial_sections.sql"), "utf8");
const down = readFileSync(join(root, "009_ems_editorial_sections.down.sql"), "utf8");

describe("EMS editorial section migration", () => {
  it("creates ordered sections and traceable track membership", () => {
    expect(up).toMatch(/CREATE TABLE ems_editorial_sections/i);
    expect(up).toMatch(/slug TEXT NOT NULL UNIQUE/i);
    expect(up).toMatch(/CREATE TABLE ems_track_sections/i);
    expect(up).toMatch(/PRIMARY KEY \(section_id, track_id\)/i);
    expect(up).toMatch(/source_playlist_id TEXT NOT NULL/i);
    expect(up).not.toMatch(/ALTER TABLE\s+(music_tracks|track_embeddings)/i);
  });

  it("drops only the two new tables in dependency order", () => {
    expect(down.indexOf("ems_track_sections")).toBeLessThan(
      down.indexOf("ems_editorial_sections"),
    );
    expect(down).not.toMatch(/DROP TABLE IF EXISTS\s+ems_tracks/i);
  });
});
