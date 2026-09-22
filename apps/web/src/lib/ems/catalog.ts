import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { Track } from "@/lib/music/types";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const CURSOR_TTL_MS = 15 * 60 * 1000;

type CursorPayload = { offset: number; filterHash: string; expiresAt: number };
type QueryExecutor = { query<Row extends Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }> };
type EmsRow = { id: string; tidal_id: string; title: string; artist: string; album: string | null; duration_ms: number; artwork_url?: string | null };

export type EmsListOptions = {
  cursor?: string;
  limit?: number;
  query?: string;
  region?: string;
  sort?: "new" | "title" | "artist";
};

function secret() {
  const value = process.env.EMS_CURSOR_SECRET?.trim();
  if (!value) throw new Error("ems_cursor_secret_missing");
  return value;
}

function filterHash(options: Pick<EmsListOptions, "query" | "region" | "sort">) {
  return createHash("sha256").update(JSON.stringify({ query: options.query?.trim() ?? "", region: options.region ?? "KR", sort: options.sort ?? "new" })).digest("hex");
}

export function encodeEmsCursor(payload: CursorPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function decodeEmsCursor(value: string, expectedFilterHash: string): CursorPayload {
  const [body, signature] = value.split(".");
  if (!body || !signature) throw new Error("ems_cursor_invalid");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("ems_cursor_invalid");
  let payload: CursorPayload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload; } catch { throw new Error("ems_cursor_invalid"); }
  if (!Number.isInteger(payload.offset) || payload.offset < 0 || payload.filterHash !== expectedFilterHash || payload.expiresAt < Date.now()) throw new Error("ems_cursor_invalid");
  return payload;
}

export async function listEmsTracks(options: EmsListOptions, executor: QueryExecutor): Promise<{ tracks: Track[]; nextCursor: string | null }> {
  const normalized = { query: options.query?.trim() || "", region: (options.region || "KR").toUpperCase(), sort: options.sort || "new" as const };
  const hash = filterHash(normalized);
  const cursor = options.cursor ? decodeEmsCursor(options.cursor, hash) : { offset: 0 };
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
  const orderBy = normalized.sort === "title" ? "e.title ASC, e.id ASC" : normalized.sort === "artist" ? "e.artist ASC, e.id ASC" : "e.updated_at DESC, e.id DESC";
  const values: unknown[] = [normalized.region, limit, cursor.offset];
  const searchClause = normalized.query ? " AND (e.title ILIKE $4 OR e.artist ILIKE $4 OR COALESCE(e.album, '') ILIKE $4)" : "";
  if (normalized.query) values.push(`%${normalized.query}%`);
  const result = await executor.query<EmsRow>(
    `SELECT e.id, e.tidal_id, e.title, e.artist, e.album, e.duration_ms, e.artwork_url
       FROM ems_tracks AS e
       JOIN LATERAL (
         SELECT a.playable
         FROM ems_availability_events AS a
         WHERE a.track_id = e.id AND a.region = $1 AND a.capability = 'STREAM'
         ORDER BY a.observed_at DESC, a.id DESC
         LIMIT 1
       ) AS availability ON availability.playable = true
      WHERE e.status = 'active'
        ${searchClause}
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3`,
    values,
  );
  const tracks = result.rows.map((row) => ({ album: row.album ?? "Unknown Album", artist: row.artist, artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900", artworkUrl: row.artwork_url ?? "", durationSeconds: Math.round(row.duration_ms / 1000), id: row.id, playbackAvailable: true, tidalTrackId: row.tidal_id, title: row.title } satisfies Track));
  return { tracks, nextCursor: tracks.length === limit ? encodeEmsCursor({ offset: cursor.offset + tracks.length, filterHash: hash, expiresAt: Date.now() + CURSOR_TTL_MS }) : null };
}

export { filterHash as getEmsFilterHash };
