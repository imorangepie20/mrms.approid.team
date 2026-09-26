import type {
  TasteProfileInput,
  TasteProfileResult,
} from "@/lib/recommendations/taste-profile";

import type { TransactionExecutor } from "./music-library";
import { getDatabasePool } from "./pool";

export type TasteProfileMetadata = {
  algorithmVersion: string;
  modelId: string;
  modelRevision: string;
};

type TasteProfileInputRow = {
  artist_name: string;
  embedding: string;
  feedback_weight: number;
  playlist_count: number;
  track_id: string;
};

export type UnmatchedTidalTrackLike = {
  album: string | null;
  artist: string;
  sourceId: string;
  title: string;
};

type ReleasableExecutor = TransactionExecutor & {
  release?: () => void;
};

function parseVector(value: string): number[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed)
    || parsed.length === 0
    || parsed.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new Error("taste_profile_vector_invalid");
  }
  return parsed;
}

export async function loadCompletedTasteProfileInputs(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<TasteProfileInput[]> {
  const database = executor ?? getDatabasePool();
  const result = await database.query<TasteProfileInputRow>(
    `WITH playlist_inputs AS (
       SELECT
         COALESCE(ems.id, t.id)::text AS track_id,
         t.artist_name,
         e.embedding::text AS embedding,
         (SELECT count(DISTINCT p.id)::integer
          FROM user_playlist_tracks AS pt
          INNER JOIN user_playlists AS p
            ON p.id = pt.playlist_id AND p.user_id = u.id AND p.selected = true
          WHERE pt.track_id = t.id) AS playlist_count,
         CASE WHEN EXISTS (
           SELECT 1 FROM user_likes AS liked
           WHERE liked.user_id = u.id
             AND liked.entity_type = 'track'
             AND liked.source = 'tidal'
             AND liked.source_id = t.tidal_track_id
         ) THEN 2::float8 ELSE 1::float8 END AS feedback_weight
       FROM track_embeddings AS e
       INNER JOIN music_tracks AS t ON t.id = e.track_id
       INNER JOIN app_users AS u ON u.id = t.user_id
       LEFT JOIN ems_tracks AS ems ON ems.tidal_id = t.tidal_track_id
       WHERE u.auth0_subject = $1 AND e.status = 'completed'
     ),
     positive_feedback AS (
       SELECT
         ems.id::text AS track_id,
         ems.artist,
         em.embedding::text AS embedding,
         1::integer AS playlist_count,
         2::float8 AS feedback_weight
       FROM ems_tracks AS ems
       INNER JOIN ems_track_embeddings AS em
         ON em.track_id = ems.id AND em.status = 'completed'
       INNER JOIN app_users AS u ON u.auth0_subject = $1
       WHERE (
         EXISTS (
           SELECT 1 FROM user_likes AS liked
           WHERE liked.user_id = u.id
             AND liked.entity_type = 'track'
             AND liked.source = 'tidal'
             AND liked.source_id = ems.tidal_id
         ) OR EXISTS (
           SELECT 1 FROM user_recommendation_decisions AS accepted
           WHERE accepted.user_id = u.id
             AND accepted.source_track_id = ems.id
             AND accepted.decision = 'accept'
         )
       ) AND NOT EXISTS (
         SELECT 1 FROM user_recommendation_decisions AS rejected
         WHERE rejected.user_id = u.id
           AND rejected.source_track_id = ems.id
           AND rejected.decision = 'reject'
       )
     ),
     all_inputs AS (
       SELECT * FROM playlist_inputs
       UNION ALL
       SELECT * FROM positive_feedback
     )
     SELECT
       track_id,
       min(artist_name) AS artist_name,
       min(embedding) AS embedding,
       max(playlist_count)::integer AS playlist_count,
       max(feedback_weight)::float8 AS feedback_weight
     FROM all_inputs
     GROUP BY track_id
     ORDER BY track_id`,
    [auth0Subject],
  );
  return result.rows.map((row) => ({
    artist: row.artist_name,
    embedding: parseVector(row.embedding),
    feedbackWeight: row.feedback_weight,
    playlistCount: row.playlist_count,
    trackId: row.track_id,
  }));
}

export async function loadUnmatchedTidalTrackLikes(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<UnmatchedTidalTrackLike[]> {
  const database = executor ?? getDatabasePool();
  const result = await database.query<UnmatchedTidalTrackLike>(
    `SELECT liked.source_id AS "sourceId",
       liked.title,
       liked.subtitle AS artist,
       liked.metadata ->> 'album' AS album
     FROM user_likes AS liked
     INNER JOIN app_users AS u ON u.id = liked.user_id
     WHERE u.auth0_subject = $1
       AND liked.entity_type = 'track'
       AND liked.source = 'tidal'
       AND NOT EXISTS (
         SELECT 1 FROM ems_tracks AS ems
         INNER JOIN ems_track_embeddings AS embedding
           ON embedding.track_id = ems.id AND embedding.status = 'completed'
         WHERE ems.tidal_id = liked.source_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM music_tracks AS track
         WHERE track.user_id = u.id
           AND track.tidal_track_id = liked.source_id
       )
     ORDER BY liked.source_id`,
    [auth0Subject],
  );
  return result.rows;
}

export async function replaceTasteProfile(
  auth0Subject: string,
  result: TasteProfileResult,
  metadata: TasteProfileMetadata,
  executor?: TransactionExecutor,
): Promise<void> {
  if (!result.centroids.some((centroid) => centroid.clusterIndex === 0)) {
    throw new Error("taste_profile_global_centroid_missing");
  }
  const transaction = (executor
    ?? await getDatabasePool().connect()) as ReleasableExecutor;
  try {
    await transaction.query("BEGIN");
    const profile = await transaction.query<{ id: string }>(
      `INSERT INTO user_taste_profiles (
         user_id, model_id, model_revision, algorithm_version,
         status, unique_track_count, updated_at
       )
       SELECT u.id, $2, $3, $4, 'building', $5, now()
       FROM app_users AS u
       WHERE u.auth0_subject = $1
       ON CONFLICT (user_id, model_id, model_revision, algorithm_version)
       DO UPDATE SET
         status = 'building',
         unique_track_count = EXCLUDED.unique_track_count,
         updated_at = now()
       RETURNING id`,
      [
        auth0Subject,
        metadata.modelId,
        metadata.modelRevision,
        metadata.algorithmVersion,
        result.uniqueTrackCount,
      ],
    );
    const profileId = profile.rows[0]?.id;
    if (!profileId) throw new Error("taste_profile_user_not_found");

    await transaction.query(
      "DELETE FROM user_taste_centroids WHERE profile_id = $1",
      [profileId],
    );
    const centroids = [...result.centroids].sort(
      (left, right) => left.clusterIndex - right.clusterIndex,
    );
    for (const centroid of centroids) {
      await transaction.query(
        `INSERT INTO user_taste_centroids (
           profile_id, cluster_index, track_count, weight, embedding
         )
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [
          profileId,
          centroid.clusterIndex,
          centroid.trackCount,
          centroid.weight,
          JSON.stringify(centroid.embedding),
        ],
      );
    }
    await transaction.query(
      `UPDATE user_taste_profiles AS profile
       SET status = 'completed', updated_at = now()
       FROM app_users AS u
       WHERE u.auth0_subject = $1
         AND profile.user_id = u.id
         AND profile.id = $2`,
      [auth0Subject, profileId],
    );
    await transaction.query("COMMIT");
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    if (!executor) transaction.release?.();
  }
}
