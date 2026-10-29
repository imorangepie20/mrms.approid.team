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
    const v2Exploration = v2Tracks.filter(isExploration);
    const baselineGeneral = baselineTracks.slice(0, v2General.length);

    const known = (tracks: EmsRecommendationTrack[]) =>
      tracks.map(languageOf).filter((language) => !NEUTRAL_LANGUAGES.has(language));
    const mmsLanguages = v2!.attributeProfile?.languages ?? {};
    const baselineTvd = totalVariation(distribution(known(baselineGeneral)), mmsLanguages);
    const v2Tvd = totalVariation(distribution(known(v2General)), mmsLanguages);

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

    expect(v2General.some((track) => (attributes.get(track.id)?.genre_buckets?.trot ?? 0) > 0)).toBe(false);
    expect(v2Tvd).toBeLessThan(baselineTvd);
  });
});
