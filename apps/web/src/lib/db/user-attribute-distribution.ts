import {
  ATTRIBUTE_RANKING,
  type DistributionInput,
} from "@/lib/recommendations/attribute-affinity";

import type { TransactionExecutor } from "./music-library";
import { getDatabasePool } from "./pool";

export type UserAttributeDistributionInput = DistributionInput & {
  taxonomyVersion: string | null;
};

type DistributionRow = {
  genre_buckets: unknown;
  language: unknown;
  taxonomy_version: unknown;
  weight: unknown;
};

function genreBuckets(value: unknown): Record<string, number> {
  const parsed = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return null;
        }
      })()
    : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).filter(([, share]) =>
    typeof share === "number" && Number.isFinite(share)));
}

/**
 * 사용자 취향 분포 입력. 선택된 MMS 플레이리스트 곡은 weight 1, GMS 결정은
 * accept 1·reject `rejectWeight`로 센다. skip은 넣지 않는다.
 * 같은 곡은 한 번만 센다: MMS 곡은 여러 플레이리스트에 있어도 한 번,
 * GMS 곡은 reject가 한 번이라도 있으면 reject(영구 제외 규칙과 같다)로 센다.
 */
export async function loadUserAttributeDistributionInputs(
  userId: string,
  executor?: TransactionExecutor,
): Promise<UserAttributeDistributionInput[]> {
  const result = await (executor ?? getDatabasePool()).query<DistributionRow>(
    `/* user_attribute_distribution */
     SELECT attribute.language, attribute.genre_buckets, attribute.taxonomy_version,
       1::float8 AS weight
     FROM music_track_attributes AS attribute
     WHERE attribute.track_id IN (
       SELECT owned.id
       FROM music_tracks AS owned
       INNER JOIN user_playlist_tracks AS playlist_track ON playlist_track.track_id = owned.id
       INNER JOIN user_playlists AS playlist
         ON playlist.id = playlist_track.playlist_id
        AND playlist.user_id = $1
        AND playlist.selected = true
       WHERE owned.user_id = $1
     )
     UNION ALL
     SELECT attribute.language, attribute.genre_buckets, attribute.taxonomy_version,
       decided.weight
     FROM (
       SELECT decision.source_track_id,
         CASE WHEN bool_or(decision.decision = 'reject') THEN $2::float8 ELSE 1::float8 END
           AS weight
       FROM user_recommendation_decisions AS decision
       WHERE decision.user_id = $1 AND decision.decision IN ('accept', 'reject')
       GROUP BY decision.source_track_id
     ) AS decided
     INNER JOIN ems_track_attributes AS attribute ON attribute.track_id = decided.source_track_id`,
    [userId, ATTRIBUTE_RANKING.rejectWeight],
  );
  return result.rows.flatMap((row) => {
    const weight = Number(row.weight);
    if (typeof row.language !== "string" || !Number.isFinite(weight)) return [];
    return [{
      genreBuckets: genreBuckets(row.genre_buckets),
      language: row.language,
      taxonomyVersion: typeof row.taxonomy_version === "string" ? row.taxonomy_version : null,
      weight,
    }];
  });
}

/** 분포 입력 행의 `taxonomy_version` 최빈값. 동률이면 문자열이 큰 쪽을 고른다. */
export function dominantTaxonomyVersion(
  inputs: UserAttributeDistributionInput[],
): string | null {
  const counts = new Map<string, number>();
  for (const input of inputs) {
    if (input.taxonomyVersion !== null) {
      counts.set(input.taxonomyVersion, (counts.get(input.taxonomyVersion) ?? 0) + 1);
    }
  }
  let best: [string, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] > best[0])) best = entry;
  }
  return best?.[0] ?? null;
}
