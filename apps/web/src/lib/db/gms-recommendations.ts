import type { Track } from "@/lib/music/types";
import { calculateEmsScore } from "@/lib/recommendations/gms";

import type { TransactionExecutor } from "./music-library";
import { getDatabasePool } from "./pool";

type ProfileRow = {
  algorithm_version: string;
  id: string;
  user_id: string;
};

export type EmsCandidateRow = {
  album: string | null;
  artist: string;
  artwork_url: string | null;
  catalog_priority: number;
  duration_ms: number;
  freshness: number;
  id: string;
  match_confidence: number;
  similarity_cluster: number | null;
  similarity_global: number;
  tidal_id: string;
  title: string;
};

export type RecommendationScoreComponents = {
  catalogPriority: number;
  diversity: number;
  freshness: number;
  matchConfidence: number;
  similarity: number;
};

export type EmsRecommendationTrack = Track & {
  recommendation: {
    reasonCodes: string[];
    score: number;
    scoreComponents: RecommendationScoreComponents;
  };
};

export type PersonalizedRecommendations = {
  profileReady: boolean;
  profileVersion: string | null;
  tracks: EmsRecommendationTrack[];
};

export type RecommendationDecision = {
  decision: "accept" | "reject" | "skip";
  profileVersion: string;
  reasonCodes: string[];
  scoreComponents: Record<string, number>;
  sourceTrackId: string;
};

function database(executor?: TransactionExecutor) {
  return executor ?? getDatabasePool();
}

function similarity(row: EmsCandidateRow) {
  return row.similarity_cluster === null
    ? row.similarity_global
    : 0.3 * row.similarity_global + 0.7 * row.similarity_cluster;
}

function score(row: EmsCandidateRow, diversity: number) {
  const components: RecommendationScoreComponents = {
    catalogPriority: row.catalog_priority,
    diversity,
    freshness: row.freshness,
    matchConfidence: row.match_confidence,
    similarity: similarity(row),
  };
  return {
    components,
    score: calculateEmsScore({
      catalogPriority: components.catalogPriority,
      diversity: components.diversity,
      freshness: components.freshness,
      matchConfidence: components.matchConfidence,
      similarity: components.similarity,
    }),
  };
}

export function rankEmsCandidates(
  rows: EmsCandidateRow[],
  limit: number,
) {
  const remaining = [...rows];
  const selected: Array<EmsCandidateRow & {
    recommendation: {
      score: number;
      scoreComponents: RecommendationScoreComponents;
    };
  }> = [];

  while (remaining.length > 0 && selected.length < limit) {
    const ranked = remaining.map((row) => {
      const repeatedArtist = selected.some((candidate) => candidate.artist === row.artist);
      const rankedScore = score(row, repeatedArtist ? 0.25 : 1);
      return { row, ...rankedScore };
    });
    ranked.sort((left, right) =>
      right.score - left.score || left.row.id.localeCompare(right.row.id),
    );
    const next = ranked[0];
    if (!next) break;
    selected.push({
      ...next.row,
      recommendation: {
        score: next.score,
        scoreComponents: next.components,
      },
    });
    const index = remaining.findIndex((row) => row.id === next.row.id);
    remaining.splice(index, 1);
  }

  return selected;
}

function mapRecommendation(
  row: EmsCandidateRow & {
    recommendation: {
      score: number;
      scoreComponents: RecommendationScoreComponents;
    };
  },
): EmsRecommendationTrack {
  const reasons = ["taste_match"];
  if (row.recommendation.scoreComponents.freshness >= 0.8) {
    reasons.push("fresh_release");
  }
  return {
    album: row.album ?? "Unknown Album",
    artist: row.artist,
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    artworkUrl: row.artwork_url ?? "",
    durationSeconds: Math.round(row.duration_ms / 1000),
    id: row.id,
    playbackAvailable: true,
    recommendation: {
      reasonCodes: reasons,
      score: row.recommendation.score,
      scoreComponents: row.recommendation.scoreComponents,
    },
    tidalTrackId: row.tidal_id,
    title: row.title,
  };
}

export async function listPersonalizedEmsRecommendations(
  auth0Subject: string,
  limit = 12,
  executor?: TransactionExecutor,
): Promise<PersonalizedRecommendations> {
  const safeLimit = Math.max(1, Math.min(24, Math.trunc(limit)));
  const profileResult = await database(executor).query<ProfileRow>(
    `SELECT p.id, p.user_id, p.algorithm_version
     FROM user_taste_profiles AS p
     INNER JOIN app_users AS u ON u.id = p.user_id
     WHERE u.auth0_subject = $1 AND p.status = 'completed'
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT 1`,
    [auth0Subject],
  );
  const profile = profileResult.rows[0];
  if (!profile) {
    return { profileReady: false, profileVersion: null, tracks: [] };
  }

  const candidateResult = await database(executor).query<EmsCandidateRow>(
    `WITH centroid_similarity AS (
       SELECT
         e.id,
         MAX(CASE WHEN c.cluster_index = 0
           THEN 1 - (embedding.embedding <=> c.embedding) END)::float8 AS similarity_global,
         MAX(CASE WHEN c.cluster_index > 0
           THEN 1 - (embedding.embedding <=> c.embedding) END)::float8 AS similarity_cluster
       FROM ems_tracks AS e
       INNER JOIN ems_track_embeddings AS embedding
         ON embedding.track_id = e.id AND embedding.status = 'completed'
       INNER JOIN user_taste_centroids AS c ON c.profile_id = $1
       WHERE e.status = 'active'
       GROUP BY e.id
     )
     SELECT
       e.id,
       e.tidal_id,
       e.title,
       e.artist,
       e.album,
       e.duration_ms,
       e.artwork_url,
       e.match_confidence,
       e.catalog_priority,
       GREATEST(0, 1 - EXTRACT(EPOCH FROM (now() - e.updated_at)) / (365 * 86400))::float8 AS freshness,
       cs.similarity_global,
       cs.similarity_cluster
     FROM ems_tracks AS e
     INNER JOIN centroid_similarity AS cs ON cs.id = e.id
     JOIN LATERAL (
       SELECT a.playable
       FROM ems_availability_events AS a
       WHERE a.track_id = e.id AND a.region = 'KR' AND a.capability = 'STREAM'
       ORDER BY a.observed_at DESC, a.id DESC
       LIMIT 1
     ) AS availability ON availability.playable = true
     WHERE e.status = 'active'
       AND NOT EXISTS (
         SELECT 1
         FROM music_tracks AS owned
         INNER JOIN user_playlist_tracks AS playlist_track ON playlist_track.track_id = owned.id
         INNER JOIN user_playlists AS playlist
           ON playlist.id = playlist_track.playlist_id
          AND playlist.user_id = $2
          AND playlist.selected = true
         WHERE owned.user_id = $2 AND owned.tidal_track_id = e.tidal_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM user_recommendation_decisions AS decision
         WHERE decision.user_id = $2
           AND decision.source_track_id = e.id
           AND decision.decision IN ('accept', 'reject')
       )
     ORDER BY
       CASE WHEN cs.similarity_cluster IS NULL
         THEN cs.similarity_global
         ELSE 0.3 * cs.similarity_global + 0.7 * cs.similarity_cluster
       END DESC,
       e.id ASC
     LIMIT $3`,
    [profile.id, profile.user_id, Math.min(120, safeLimit * 5)],
  );

  return {
    profileReady: true,
    profileVersion: profile.algorithm_version,
    tracks: rankEmsCandidates(candidateResult.rows, safeLimit).map(mapRecommendation),
  };
}

export async function saveRecommendationDecision(
  auth0Subject: string,
  input: RecommendationDecision,
  executor?: TransactionExecutor,
): Promise<void> {
  const result = await database(executor).query<{ id: string }>(
    `INSERT INTO user_recommendation_decisions
      (user_id, source_track_id, profile_version, decision, reason_codes, score_components)
     SELECT u.id, $2, $3, $4, $5::jsonb, $6::jsonb
     FROM app_users AS u
     WHERE u.auth0_subject = $1
     RETURNING id`,
    [
      auth0Subject,
      input.sourceTrackId,
      input.profileVersion,
      input.decision,
      JSON.stringify(input.reasonCodes),
      JSON.stringify(input.scoreComponents),
    ],
  );
  if (!result.rows[0]) throw new Error("recommendation_user_not_found");
}
