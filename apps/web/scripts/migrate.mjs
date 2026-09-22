import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const FORWARD_MIGRATION = /^\d{3}_.+\.sql$/;
const ADVISORY_LOCK = "music-pie-schema-migrations";

export async function loadForwardMigrations(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && FORWARD_MIGRATION.test(entry.name) && !entry.name.endsWith(".down.sql"))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(names.map(async (id) => {
    const sql = await readFile(path.join(directory, id), "utf8");
    return { id, checksum: createHash("sha256").update(sql).digest("hex"), sql };
  }));
}

export function planMigrations(files, applied) {
  const appliedById = new Map(applied.map((migration) => [migration.id, migration.checksum]));
  for (const migration of files) {
    const checksum = appliedById.get(migration.id);
    if (checksum && checksum !== migration.checksum) {
      throw new Error(`Migration checksum mismatch: ${migration.id}`);
    }
  }
  return files.filter((migration) => !appliedById.has(migration.id));
}

async function verifyBaseline(client, files, through) {
  const end = files.findIndex((migration) => migration.id === through);
  if (end < 0) throw new Error(`Unknown baseline migration: ${through}`);
  const requiredTables = [
    "app_users", "tidal_connections", "user_playlists", "music_tracks",
    "user_playlist_tracks", "playlist_imports", "musicbrainz_enrichment_jobs",
    "musicbrainz_rate_limits", "user_likes", "musicbrainz_artists",
  ];
  for (const table of requiredTables) {
    const result = await client.query("SELECT to_regclass($1) AS name", [table]);
    if (!result.rows[0]?.name) throw new Error(`Baseline table missing: ${table}`);
  }
  const columns = [
    ["music_tracks", "mb_genres"], ["music_tracks", "mb_tags"],
  ];
  for (const [table, column] of columns) {
    const result = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2",
      [table, column],
    );
    if (!result.rowCount) throw new Error(`Baseline column missing: ${table}.${column}`);
  }
  return files.slice(0, end + 1);
}

async function applyMigrations({ client, files, baselineThrough }) {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  let appliedResult = await client.query("SELECT id, checksum FROM schema_migrations ORDER BY id");
  let applied = appliedResult.rows;
  if (baselineThrough) {
    const baseline = await verifyBaseline(client, files, baselineThrough);
    const alreadyApplied = new Set(applied.map((migration) => migration.id));
    for (const migration of baseline) {
      if (!alreadyApplied.has(migration.id)) {
        await client.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, migration.checksum]);
      }
    }
    appliedResult = await client.query("SELECT id, checksum FROM schema_migrations ORDER BY id");
    applied = appliedResult.rows;
  }
  const pending = planMigrations(files, applied);
  for (const migration of pending) {
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)", [migration.id, migration.checksum]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  return pending.length;
}

export async function runMigrations({ databaseUrl, directory, baselineThrough } = {}) {
  const connectionString = (databaseUrl ?? process.env.DATABASE_URL ?? "").trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const files = await loadForwardMigrations(directory ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "db", "migrations"));
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [ADVISORY_LOCK]);
    return await applyMigrations({ client, files, baselineThrough });
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [ADVISORY_LOCK]).catch(() => {});
    await client.end();
  }
}

function parseArgs(argv) {
  const args = { baselineThrough: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--baseline-through") args.baselineThrough = argv[++index];
    else if (argv[index].startsWith("--baseline-through=")) args.baselineThrough = argv[index].slice("--baseline-through=".length);
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const { baselineThrough } = parseArgs(argv);
  const count = await runMigrations({ baselineThrough });
  console.log(`${count} pending migrations applied`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "migration_failed");
    process.exitCode = 1;
  });
}
