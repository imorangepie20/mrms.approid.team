import type { QueryExecutor } from "@/lib/ems/admin";

type CountRow = {
  active_count: number;
  tagged_count: number;
  release_dated_count: number;
  musicbrainz_date_count: number;
  tidal_date_count: number;
  first_ingested_at: string | null;
  latest_ingested_at: string | null;
};
type BucketRow = { label: string; count: number };

export async function getEmsStatistics(executor: QueryExecutor) {
  const [counts, tags, releases, arrivals] = await Promise.all([
    executor.query<CountRow>(`SELECT count(*)::int AS active_count,
        count(*) FILTER (WHERE cardinality(mb_tags) > 0)::int AS tagged_count,
        count(*) FILTER (WHERE COALESCE(mb_first_release_date, tidal_album_release_date, release_date) IS NOT NULL)::int AS release_dated_count,
        count(mb_first_release_date)::int AS musicbrainz_date_count,
        count(tidal_album_release_date)::int AS tidal_date_count,
        min(first_seen_at)::text AS first_ingested_at,
        max(first_seen_at)::text AS latest_ingested_at
       FROM ems_tracks WHERE status = 'active'`),
    executor.query<BucketRow>(`SELECT tag AS label, count(*)::int AS count
       FROM (SELECT DISTINCT e.id, btrim(tag) AS tag
               FROM ems_tracks e CROSS JOIN LATERAL unnest(e.mb_tags) tag
              WHERE e.status = 'active') tagged
      WHERE tag <> '' GROUP BY tag ORDER BY count DESC, tag LIMIT 15`),
    executor.query<BucketRow>(`SELECT (extract(year FROM COALESCE(mb_first_release_date, tidal_album_release_date, release_date))::int / 10 * 10)::text AS label,
        count(*)::int AS count
       FROM ems_tracks
      WHERE status = 'active' AND COALESCE(mb_first_release_date, tidal_album_release_date, release_date) IS NOT NULL
      GROUP BY 1 ORDER BY 1`),
    executor.query<BucketRow>(`SELECT to_char(first_seen_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS label,
        count(*)::int AS count
       FROM ems_tracks WHERE status = 'active'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 30`),
  ]);
  const row = counts.rows[0];
  return {
    activeCount: Number(row?.active_count ?? 0),
    taggedCount: Number(row?.tagged_count ?? 0),
    releaseDatedCount: Number(row?.release_dated_count ?? 0),
    musicbrainzDateCount: Number(row?.musicbrainz_date_count ?? 0),
    tidalDateCount: Number(row?.tidal_date_count ?? 0),
    firstIngestedAt: row?.first_ingested_at ?? null,
    latestIngestedAt: row?.latest_ingested_at ?? null,
    tags: tags.rows.map((item) => ({ label: item.label, count: Number(item.count) })),
    releaseDecades: releases.rows.map((item) => ({ label: `${item.label}년대`, count: Number(item.count) })),
    arrivalsByDay: arrivals.rows.reverse().map((item) => ({ label: item.label, count: Number(item.count) })),
  };
}
