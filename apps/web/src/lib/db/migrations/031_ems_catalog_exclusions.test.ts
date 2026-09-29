import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "src/lib/db/migrations/031_ems_catalog_exclusions.sql");
const rollbackPath = join(process.cwd(), "src/lib/db/migrations/031_ems_catalog_exclusions.down.sql");

describe("EMS catalog exclusions migration", () => {
  it("stores only durable track identities and an exclusion reason", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE TABLE ems_catalog_exclusions/i);
    expect(sql).toMatch(/tidal_id TEXT/i);
    expect(sql).toMatch(/isrc TEXT/i);
    expect(sql).toMatch(/reason TEXT NOT NULL/i);
    expect(sql).toMatch(/CHECK \(tidal_id IS NOT NULL OR isrc IS NOT NULL\)/i);
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*tidal_id/i);
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*isrc/i);
    expect(sql).not.toMatch(/title|artist|album|user_id/i);
  });

  it("rolls back only the exclusion table", async () => {
    const sql = await readFile(rollbackPath, "utf8");

    expect(sql).toMatch(/DROP TABLE IF EXISTS ems_catalog_exclusions/i);
    expect(sql).not.toMatch(/DROP TABLE IF EXISTS\s+(ems_tracks|user_recommendation_batches|app_users)/i);
  });
});
