import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(root, "021_ems_spotify_charts.sql"), "utf8");

describe("Spotify chart migration", () => {
  it("keeps imports bounded and snapshots isolated", () => {
    expect(migration).toContain("spotify_request_budget = 4");
    expect(migration).toContain("source_track_count BETWEEN 0 AND 50");
    expect(migration).toContain("sequence_no BETWEEN 0 AND 49");
    expect(migration).toContain("ems_spotify_chart_one_open_run");
    expect(migration).toContain("ems_spotify_chart_one_active_run");
  });
});
