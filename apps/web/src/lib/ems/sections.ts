import type { Track } from "@/lib/music/types";

export type QueryExecutor = {
  query<Row extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

export type EmsEditorialSection = {
  slug: string;
  title: string;
  description: string;
  tracks: Track[];
};

export type EmsSectionsResponse = {
  totalCount: number;
  sections: EmsEditorialSection[];
};

type EmsSectionRow = {
  slug: string;
  section_title: string;
  section_description: string;
  sort_order: number;
  rank: number;
  track_id: string;
  tidal_id: string;
  track_title: string;
  artist: string;
  album: string | null;
  duration_ms: number;
};

const COUNT_SQL = `
  SELECT count(*)::int AS total_count
  FROM ems_tracks AS e
  JOIN LATERAL (
    SELECT a.playable
    FROM ems_availability_events AS a
    WHERE a.track_id = e.id AND a.region = $1 AND a.capability = 'STREAM'
    ORDER BY a.observed_at DESC, a.id DESC
    LIMIT 1
  ) AS availability ON availability.playable = true
  WHERE e.status = 'active'`;

const SECTION_SQL = `
  WITH active_sections AS (
    SELECT id, slug, title, description, sort_order
    FROM ems_editorial_sections
    WHERE active = true
    ORDER BY sort_order, id
  ), ranked AS (
    SELECT s.slug, s.title AS section_title,
           s.description AS section_description, s.sort_order,
           m.rank, e.id AS track_id, e.tidal_id,
           e.title AS track_title, e.artist, e.album, e.duration_ms,
           row_number() OVER (
             PARTITION BY s.id ORDER BY m.rank, e.id
           ) AS row_number
    FROM active_sections AS s
    JOIN ems_track_sections AS m ON m.section_id = s.id
    JOIN ems_tracks AS e ON e.id = m.track_id AND e.status = 'active'
    JOIN LATERAL (
      SELECT a.playable
      FROM ems_availability_events AS a
      WHERE a.track_id = e.id AND a.region = $1 AND a.capability = 'STREAM'
      ORDER BY a.observed_at DESC, a.id DESC
      LIMIT 1
    ) AS availability ON availability.playable = true
  )
  SELECT * FROM ranked
  WHERE row_number <= $2
  ORDER BY sort_order, rank, track_id`;

function mapEmsTrack(row: EmsSectionRow): Track {
  return {
    id: row.track_id,
    tidalTrackId: row.tidal_id,
    title: row.track_title,
    artist: row.artist,
    album: row.album ?? "Unknown Album",
    durationSeconds: Math.round(row.duration_ms / 1000),
    artworkUrl: "",
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    playbackAvailable: true,
  };
}

export async function listEmsSections(
  options: { limit?: number; sectionLimit?: number; region?: string },
  executor: QueryExecutor,
): Promise<EmsSectionsResponse> {
  const limit = Math.min(12, Math.max(1, Math.trunc(options.limit ?? 12)));
  const sectionLimit = Math.min(
    5,
    Math.max(1, Math.trunc(options.sectionLimit ?? 5)),
  );
  const region = (options.region ?? "KR").toUpperCase();
  const count = await executor.query<{ total_count: number }>(COUNT_SQL, [region]);
  const rows = await executor.query<EmsSectionRow>(SECTION_SQL, [
    region,
    limit * sectionLimit,
  ]);
  const seenTrackIds = new Set<string>();
  const sections = new Map<string, EmsEditorialSection>();
  for (const row of rows.rows) {
    let section = sections.get(row.slug);
    if ((!section && sections.size >= sectionLimit) || seenTrackIds.has(row.track_id)) {
      continue;
    }
    section ??= {
      slug: row.slug,
      title: row.section_title,
      description: row.section_description,
      tracks: [],
    };
    if (section.tracks.length >= limit) continue;
    seenTrackIds.add(row.track_id);
    section.tracks.push(mapEmsTrack(row));
    sections.set(row.slug, section);
  }
  return {
    totalCount: Number(count.rows[0]?.total_count ?? 0),
    sections: [...sections.values()].filter((section) => section.tracks.length > 0),
  };
}
