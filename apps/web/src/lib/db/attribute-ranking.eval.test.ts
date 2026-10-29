import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

import {
  preparePersonalizedEmsRecommendations,
  selectPreparedPersonalizedRecommendations,
  type EmsRecommendationTrack,
  type PreparedPersonalizedRecommendations,
} from "./gms-recommendations";

// 읽기 전용 오프라인 평가. 운영 DB 터널 등 명시적으로 준비한 연결에서만 실행한다.
const databaseUrl = process.env.ATTRIBUTE_RANKING_EVAL_DATABASE_URL;
const auth0Subject = process.env.ATTRIBUTE_RANKING_EVAL_AUTH0_SUBJECT ?? "";
const NEUTRAL_LANGUAGES = new Set(["unknown", "zxx"]);
const BATCH_SIZE = 24;

type TrackAttributeRow = {
  genre_buckets: Record<string, number> | null;
  language: string | null;
  track_id: string;
};

// 언어 판정과 독립적인 MMS 문자 체계 점검. 한 곡이 여러 문자 체계에 동시에 걸릴 수 있다.
const SCRIPT_PATTERNS = {
  hangul: "[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]",
  kana: "[\u3040-\u30ff]",
  han: "[\u4e00-\u9fff]",
  cyrillic: "[\u0400-\u04ff]",
  latin: "[A-Za-z\u00c0-\u024f]",
} as const;

type ScriptBreakdownRow = { total: number } & Record<keyof typeof SCRIPT_PATTERNS, number>;

function isExploration(track: EmsRecommendationTrack): boolean {
  return track.recommendation.reasonCodes.includes("exploration");
}

function distribution(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  const total = values.length;
  return Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, total === 0 ? 0 : count / total]),
  );
}

function totalVariation(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const key of keys) sum += Math.abs((a[key] ?? 0) - (b[key] ?? 0));
  return sum / 2;
}

function dominantBucket(buckets: Record<string, number> | null | undefined): string {
  const entries = Object.entries(buckets ?? {});
  if (entries.length === 0) return "none";
  return entries.sort((x, y) => y[1] - x[1])[0][0];
}

describe.runIf(Boolean(databaseUrl))("attribute ranking offline evaluation", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    client = await pool.connect();
    await client.query("BEGIN READ ONLY");
  });

  afterAll(async () => {
    try {
      await client?.query("ROLLBACK");
    } finally {
      client?.release();
      await pool?.end();
    }
  });

  it("v2 일반 22곡은 트로트가 없고 언어 분포가 MMS에 더 가깝다", async () => {
    expect(auth0Subject).not.toBe("");
    const prepared: PreparedPersonalizedRecommendations = await preparePersonalizedEmsRecommendations(
      auth0Subject,
      BATCH_SIZE,
      client,
    );
    const baselineTracks = prepared.recommendations.tracks;
    const v2 = prepared.attributeRecommendations;
    expect(v2, "baseline-v2를 만들 수 없다(표본 부족 또는 속성 없음)").not.toBeNull();
    // 서빙 선택 경로가 v2를 고를 수 있는지도 확인한다.
    selectPreparedPersonalizedRecommendations(auth0Subject, prepared, {
      ...process.env,
      GMS_RANKING_VERSION: "baseline-v2",
    });

    const v2Tracks = v2!.tracks;
    const ids = [...new Set([...baselineTracks, ...v2Tracks].map((track) => track.id))];
    const attributeResult = await client.query<TrackAttributeRow>(
      `SELECT track_id, language, genre_buckets
       FROM ems_track_attributes
       WHERE track_id = ANY($1::uuid[])`,
      [ids],
    );
    const attributes = new Map(attributeResult.rows.map((row) => [row.track_id, row]));
    const languageOf = (track: EmsRecommendationTrack) => attributes.get(track.id)?.language ?? "unknown";
    const bucketOf = (track: EmsRecommendationTrack) =>
      dominantBucket(attributes.get(track.id)?.genre_buckets);

    const v2General = v2Tracks.filter((track) => !isExploration(track));
    expect(v2General.length).toBeGreaterThan(0);
    const v2Exploration = v2Tracks.filter(isExploration);
    const baselineGeneral = baselineTracks.slice(0, v2General.length);

    const known = (tracks: EmsRecommendationTrack[]) =>
      tracks.map(languageOf).filter((language) => !NEUTRAL_LANGUAGES.has(language));
    const mmsLanguages = v2!.attributeProfile?.languages ?? {};
    // 프로필 점유율에는 unknown이 분모로 들어가므로 비교용으로는 확인된 언어만 다시 정규화한다.
    const mmsKnownTotal = Object.entries(mmsLanguages)
      .filter(([language]) => !NEUTRAL_LANGUAGES.has(language))
      .reduce((sum, [, share]) => sum + share, 0);
    const mmsKnown = Object.fromEntries(Object.entries(mmsLanguages)
      .filter(([language]) => !NEUTRAL_LANGUAGES.has(language))
      .map(([language, share]) => [language, mmsKnownTotal > 0 ? share / mmsKnownTotal : 0]));
    const baselineTvd = totalVariation(distribution(known(baselineGeneral)), mmsKnown);
    const v2Tvd = totalVariation(distribution(known(v2General)), mmsKnown);

    console.table({
      baseline: distribution(baselineTracks.map(languageOf)),
      "baseline-v2": distribution(v2Tracks.map(languageOf)),
      mms: mmsLanguages,
    });
    console.table({
      baseline: distribution(baselineTracks.map(bucketOf)),
      "baseline-v2": distribution(v2Tracks.map(bucketOf)),
    });
    console.table(v2Exploration.map((track) => ({
      artist: track.artist,
      bucket: bucketOf(track),
      language: languageOf(track),
      reasons: track.recommendation.reasonCodes.join(","),
      title: track.title,
    })));
    console.table({ baselineTvd, v2Tvd });
    console.table({
      languageCoverage: v2!.attributeProfile?.languageCoverage,
      languageSample: v2!.attributeProfile?.languageSample,
      ...v2!.attributeProfile?.languageSources,
    });

    const scriptKeys = Object.keys(SCRIPT_PATTERNS) as Array<keyof typeof SCRIPT_PATTERNS>;
    const scriptResult = await client.query<ScriptBreakdownRow>(
      `WITH selected AS (
         SELECT DISTINCT owned.id, owned.title || ' ' || owned.artist_name AS text
         FROM music_tracks AS owned
         INNER JOIN app_users AS app_user ON app_user.id = owned.user_id AND app_user.auth0_subject = $1
         INNER JOIN user_playlist_tracks AS playlist_track ON playlist_track.track_id = owned.id
         INNER JOIN user_playlists AS playlist
           ON playlist.id = playlist_track.playlist_id
          AND playlist.user_id = owned.user_id
          AND playlist.selected = true
       )
       SELECT count(*)::int AS total,
         ${scriptKeys.map((key, index) => `count(*) FILTER (WHERE text ~ $${index + 2})::int AS ${key}`).join(",\n         ")}
       FROM selected`,
      [auth0Subject, ...scriptKeys.map((key) => SCRIPT_PATTERNS[key])],
    );
    console.table(scriptResult.rows);

    expect(v2General.some((track) => (attributes.get(track.id)?.genre_buckets?.trot ?? 0) > 0)).toBe(false);
    expect(v2Tvd).toBeLessThan(baselineTvd);
  });
});
