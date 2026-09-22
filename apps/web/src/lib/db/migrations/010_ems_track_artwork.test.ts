import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

describe("EMS artwork migration", () => {
  it("expands and rolls back only the nullable EMS artwork column", () => {
    const up = readFileSync(join(root, "010_ems_track_artwork.sql"), "utf8");
    const down = readFileSync(join(root, "010_ems_track_artwork.down.sql"), "utf8");

    expect(up).toMatch(/ALTER TABLE ems_tracks[\s\S]*ADD COLUMN artwork_url TEXT/i);
    expect(up).not.toMatch(/NOT NULL/i);
    expect(down).toMatch(/ALTER TABLE ems_tracks[\s\S]*DROP COLUMN artwork_url/i);
  });
});
