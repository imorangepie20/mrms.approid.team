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
  spotifyPlaylists: EmsSpotifyPlaylist[];
};

export type EmsSpotifyPlaylist = {
  spotifyId: string;
  title: string;
  description: string;
  artworkUrl: string;
  sourceUrl: string;
  sourceTrackCount: number;
  matchedCount: number;
  tracks: Track[];
};

export type EmsScreen = "home" | "ems";

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
  artwork_url: string | null;
};

type SpotifyPlaylistRow = {
  spotify_id: string;
  title: string;
  description: string;
  artwork_url: string | null;
  source_url: string;
  source_track_count: number;
  matched_count: number;
};

type SpotifyTrackRow = {
  spotify_id: string;
  sequence_no: number;
  track_id: string;
  tidal_id: string;
  track_title: string;
  artist: string;
  album: string | null;
  duration_ms: number;
  artwork_url: string | null;
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
    SELECT s.id, s.slug, screen.title, screen.description, screen.sort_order
    FROM ems_editorial_sections AS s
    JOIN ems_screen_sections AS screen ON screen.section_id = s.id
    WHERE screen.screen = $2 AND screen.active = true
    ORDER BY screen.sort_order, s.id
  ), ranked AS (
    SELECT s.slug, s.title AS section_title,
           s.description AS section_description, s.sort_order,
           m.rank, e.id AS track_id, e.tidal_id,
           e.title AS track_title, e.artist, e.album, e.duration_ms,
           e.artwork_url,
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
  WHERE row_number <= $3
  ORDER BY sort_order, rank, track_id`;

const SPOTIFY_PLAYLIST_SQL = `
  SELECT playlist.spotify_id, playlist.title, playlist.description,
         playlist.artwork_url, playlist.source_url, playlist.source_track_count,
         count(DISTINCT track.id)::int AS matched_count
    FROM ems_spotify_chart_runs chart
    JOIN ems_spotify_chart_playlists playlist ON playlist.run_id = chart.run_id
    LEFT JOIN ems_spotify_chart_items item ON item.playlist_id = playlist.id
    LEFT JOIN ems_ingest_candidates candidate
      ON candidate.run_id = chart.run_id AND candidate.candidate_key = item.candidate_key
     AND candidate.resolver_status = 'matched'
    LEFT JOIN ems_tracks track ON track.tidal_id = candidate.tidal_id AND track.status = 'active'
   WHERE chart.active = true AND chart.status = 'completed'
   GROUP BY playlist.id
   ORDER BY playlist.display_order`;

const SPOTIFY_TRACK_SQL = `
  SELECT playlist.spotify_id, item.sequence_no, track.id AS track_id, track.tidal_id,
         track.title AS track_title, track.artist, track.album, track.duration_ms,
         track.artwork_url
    FROM ems_spotify_chart_runs chart
    JOIN ems_spotify_chart_playlists playlist ON playlist.run_id = chart.run_id
    JOIN ems_spotify_chart_items item ON item.playlist_id = playlist.id
    JOIN ems_ingest_candidates candidate
      ON candidate.run_id = chart.run_id AND candidate.candidate_key = item.candidate_key
     AND candidate.resolver_status = 'matched'
    JOIN ems_tracks track ON track.tidal_id = candidate.tidal_id AND track.status = 'active'
    JOIN LATERAL (
      SELECT availability.playable
        FROM ems_availability_events availability
       WHERE availability.track_id = track.id
         AND availability.region = $1 AND availability.capability = 'STREAM'
       ORDER BY availability.observed_at DESC, availability.id DESC
       LIMIT 1
    ) availability ON availability.playable = true
   WHERE chart.active = true AND chart.status = 'completed'
   ORDER BY playlist.display_order, item.sequence_no`;

function mapEmsTrack(row: Pick<
  EmsSectionRow,
  "track_id" | "tidal_id" | "track_title" | "artist" | "album" | "duration_ms" | "artwork_url"
>): Track {
  return {
    id: row.track_id,
    tidalTrackId: row.tidal_id,
    title: row.track_title,
    artist: row.artist,
    album: row.album ?? "Unknown Album",
    durationSeconds: Math.round(row.duration_ms / 1000),
    artworkUrl: row.artwork_url ?? "",
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    playbackAvailable: true,
  };
}

export async function listEmsSections(
  options: { limit?: number; sectionLimit?: number; region?: string; screen?: EmsScreen },
  executor: QueryExecutor,
): Promise<EmsSectionsResponse> {
  const limit = Math.min(12, Math.max(1, Math.trunc(options.limit ?? 12)));
  const sectionLimit = Math.min(
    5,
    Math.max(1, Math.trunc(options.sectionLimit ?? 5)),
  );
  const region = (options.region ?? "KR").toUpperCase();
  const screen = options.screen ?? "ems";
  const count = await executor.query<{ total_count: number }>(COUNT_SQL, [region]);
  const rows = await executor.query<EmsSectionRow>(SECTION_SQL, [
    region,
    screen,
    limit * sectionLimit,
  ]);
  const spotifyPlaylistRows = screen === "ems"
    ? await executor.query<SpotifyPlaylistRow>(SPOTIFY_PLAYLIST_SQL)
    : { rows: [] };
  const spotifyTrackRows = screen === "ems" && spotifyPlaylistRows.rows.length
    ? await executor.query<SpotifyTrackRow>(SPOTIFY_TRACK_SQL, [region])
    : { rows: [] };
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
  const spotifyTracks = new Map<string, Track[]>();
  for (const row of spotifyTrackRows.rows) {
    spotifyTracks.set(row.spotify_id, [
      ...(spotifyTracks.get(row.spotify_id) ?? []),
      mapEmsTrack(row),
    ]);
  }
  return {
    totalCount: Number(count.rows[0]?.total_count ?? 0),
    sections: [...sections.values()].filter((section) => section.tracks.length > 0),
    spotifyPlaylists: spotifyPlaylistRows.rows.map((playlist) => ({
      spotifyId: playlist.spotify_id,
      title: playlist.title,
      description: playlist.description,
      artworkUrl: playlist.artwork_url ?? "",
      sourceUrl: playlist.source_url,
      sourceTrackCount: Number(playlist.source_track_count),
      matchedCount: Number(playlist.matched_count),
      tracks: spotifyTracks.get(playlist.spotify_id) ?? [],
    })),
  };
}
