import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "src/lib/db/migrations/027_terminal_audio_candidate_provenance.sql",
);
const rollbackPath = join(
  process.cwd(),
  "src/lib/db/migrations/027_terminal_audio_candidate_provenance.down.sql",
);

describe("027 terminal audio candidate provenance migration", () => {
  it("separates served baseline, discarded audio candidates, and backfills", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/served_baseline_track_ids UUID\[\]/i);
    expect(sql).toMatch(/audio_discarded_track_ids UUID\[\] NOT NULL/i);
    expect(sql).toMatch(/audio_discarded_error_codes TEXT\[\] NOT NULL/i);
    expect(sql).toMatch(/backfilled_track_ids UUID\[\] NOT NULL/i);
    expect(sql).toMatch(/SET served_baseline_track_ids = baseline_track_ids/i);
    expect(sql).toMatch(/cardinality\(audio_discarded_track_ids\) = cardinality\(audio_discarded_error_codes\)/i);
  });

  it("rolls back only the added provenance columns", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP COLUMN IF EXISTS served_baseline_track_ids/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS audio_discarded_track_ids/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS audio_discarded_error_codes/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS backfilled_track_ids/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
