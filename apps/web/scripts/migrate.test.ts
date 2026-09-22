import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadForwardMigrations, planMigrations } from "./migrate.mjs";

describe("migration planner", () => {
  it("loads only forward migrations in filename order", async () => {
    const directory = join(tmpdir(), `music-pie-migrations-${Date.now()}`);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(join(directory, "002_second.sql"), "select 2;\n");
      await writeFile(join(directory, "001_first.sql"), "select 1;\n");
      await writeFile(join(directory, "001_first.down.sql"), "select 0;\n");
      const migrations = await loadForwardMigrations(directory);
      expect(migrations.map((migration) => migration.id)).toEqual(["001_first.sql", "002_second.sql"]);
      expect(migrations[0].checksum).toBe(createHash("sha256").update("select 1;\n").digest("hex"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns unapplied files and rejects checksum drift", () => {
    const files = [
      { id: "001_first.sql", checksum: "aaa", sql: "select 1" },
      { id: "002_second.sql", checksum: "bbb", sql: "select 2" },
    ];
    expect(planMigrations(files, [{ id: "001_first.sql", checksum: "aaa" }])).toEqual([files[1]]);
    expect(() => planMigrations(files, [{ id: "001_first.sql", checksum: "changed" }])).toThrow(
      "Migration checksum mismatch: 001_first.sql",
    );
  });
});
