import { createHash } from "node:crypto";

import { buildEmbeddingText } from "@/lib/music/recommendations";

import { getDatabasePool } from "./pool";
import type { TransactionExecutor } from "./music-library";

export type EmbeddingModel = {
  modelId: string;
  modelRevision: string;
};

export type ClaimedEmbeddingJob = {
  attemptCount: number;
  inputHash: string;
  inputText: string;
  trackId: string;
};

export type CompletedEmbeddingJob = ClaimedEmbeddingJob & {
  embedding: number[];
};

type EmbeddingTrackRow = {
  album_name: string;
  artist_name: string;
  id: string;
  mb_genres: string[];
  mb_tags: string[];
  playlist_count: number;
  title: string;
};

type ClaimedEmbeddingJobRow = {
  attempt_count: number;
  input_hash: string;
  input_text: string;
  track_id: string;
};

function database(executor?: TransactionExecutor) {
  return executor ?? getDatabasePool();
}

function toClaimedJob(row: ClaimedEmbeddingJobRow): ClaimedEmbeddingJob {
  return {
    attemptCount: row.attempt_count,
    inputHash: row.input_hash,
    inputText: row.input_text,
    trackId: row.track_id,
  };
}

export async function syncEmbeddingJobs(
  auth0Subject: string,
  model: EmbeddingModel,
  vocabulary: string[],
  executor?: TransactionExecutor,
): Promise<number> {
  const client = database(executor);
  const tracks = await client.query<EmbeddingTrackRow>(
    `SELECT
       t.id,
       t.title,
       t.artist_name,
       t.album_name,
       t.mb_genres,
       t.mb_tags,
       count(DISTINCT p.id)::integer AS playlist_count
     FROM music_tracks AS t
     INNER JOIN app_users AS u ON u.id = t.user_id
     LEFT JOIN user_playlist_tracks AS pt ON pt.track_id = t.id
     LEFT JOIN user_playlists AS p
       ON p.id = pt.playlist_id AND p.user_id = u.id AND p.selected = true
     WHERE u.auth0_subject = $1
     GROUP BY t.id
     ORDER BY t.created_at, t.id`,
    [auth0Subject],
  );

  for (const row of tracks.rows) {
    const inputText = buildEmbeddingText(
      {
        album: row.album_name,
        artist: row.artist_name,
        artworkClass: "",
        artworkUrl: "",
        genres: row.mb_genres,
        id: row.id,
        tags: row.mb_tags,
        title: row.title,
      },
      vocabulary,
    );
    const inputHash = createHash("sha256")
      .update(`${model.modelRevision}\0${inputText}`)
      .digest("hex");

    await client.query(
      `INSERT INTO track_embeddings (
         track_id, model_id, model_revision, input_hash, input_text, status
       )
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (track_id) DO UPDATE
       SET model_id = EXCLUDED.model_id,
           model_revision = EXCLUDED.model_revision,
           input_hash = EXCLUDED.input_hash,
           input_text = EXCLUDED.input_text,
           status = CASE
             WHEN track_embeddings.model_id = EXCLUDED.model_id
              AND track_embeddings.model_revision = EXCLUDED.model_revision
              AND track_embeddings.input_hash = EXCLUDED.input_hash
               THEN track_embeddings.status
             ELSE 'pending'
           END,
           embedding = CASE
             WHEN track_embeddings.model_id = EXCLUDED.model_id
              AND track_embeddings.model_revision = EXCLUDED.model_revision
              AND track_embeddings.input_hash = EXCLUDED.input_hash
               THEN track_embeddings.embedding
             ELSE NULL
           END,
           attempt_count = CASE
             WHEN track_embeddings.model_id = EXCLUDED.model_id
              AND track_embeddings.model_revision = EXCLUDED.model_revision
              AND track_embeddings.input_hash = EXCLUDED.input_hash
               THEN track_embeddings.attempt_count
             ELSE 0
           END,
           last_error_code = CASE
             WHEN track_embeddings.model_id = EXCLUDED.model_id
              AND track_embeddings.model_revision = EXCLUDED.model_revision
              AND track_embeddings.input_hash = EXCLUDED.input_hash
               THEN track_embeddings.last_error_code
             ELSE NULL
           END,
           updated_at = CASE
             WHEN track_embeddings.model_id = EXCLUDED.model_id
              AND track_embeddings.model_revision = EXCLUDED.model_revision
              AND track_embeddings.input_hash = EXCLUDED.input_hash
               THEN track_embeddings.updated_at
             ELSE now()
           END`,
      [row.id, model.modelId, model.modelRevision, inputHash, inputText],
    );
  }

  return tracks.rows.length;
}

export async function claimEmbeddingJobs(
  auth0Subject: string,
  limit = 16,
  executor?: TransactionExecutor,
): Promise<ClaimedEmbeddingJob[]> {
  const safeLimit = Math.max(1, Math.min(16, Math.trunc(limit)));
  const result = await database(executor).query<ClaimedEmbeddingJobRow>(
    `WITH candidates AS (
       SELECT e.track_id
       FROM track_embeddings AS e
       INNER JOIN music_tracks AS t ON t.id = e.track_id
       INNER JOIN app_users AS u ON u.id = t.user_id
       WHERE u.auth0_subject = $1 AND e.status = 'pending'
       ORDER BY e.updated_at, e.track_id
       FOR UPDATE OF e SKIP LOCKED
       LIMIT $2
     )
     UPDATE track_embeddings AS e
     SET status = 'running',
         attempt_count = e.attempt_count + 1,
         last_error_code = NULL,
         updated_at = now()
     FROM candidates AS c
     WHERE e.track_id = c.track_id
     RETURNING e.track_id, e.input_hash, e.input_text, e.attempt_count`,
    [auth0Subject, safeLimit],
  );
  return result.rows.map(toClaimedJob);
}

export async function completeEmbeddingJobs(
  auth0Subject: string,
  jobs: CompletedEmbeddingJob[],
  executor?: TransactionExecutor,
): Promise<void> {
  const client = database(executor);
  for (const job of jobs) {
    await client.query(
      `UPDATE track_embeddings AS e
       SET status = 'completed',
           embedding = $4::vector,
           last_error_code = NULL,
           updated_at = now()
       FROM music_tracks AS t
       INNER JOIN app_users AS u ON u.id = t.user_id
       WHERE u.auth0_subject = $1
         AND e.track_id = $2
         AND e.input_hash = $3
         AND e.status = 'running'
         AND t.id = e.track_id`,
      [auth0Subject, job.trackId, job.inputHash, JSON.stringify(job.embedding)],
    );
  }
}

export async function retryEmbeddingJobs(
  auth0Subject: string,
  jobs: ClaimedEmbeddingJob[],
  errorCode: string,
  executor?: TransactionExecutor,
): Promise<void> {
  const client = database(executor);
  for (const job of jobs) {
    await client.query(
      `UPDATE track_embeddings AS e
       SET status = CASE WHEN e.attempt_count >= 5 THEN 'failed' ELSE 'pending' END,
           embedding = NULL,
           last_error_code = $4,
           updated_at = now()
       FROM music_tracks AS t
       INNER JOIN app_users AS u ON u.id = t.user_id
       WHERE u.auth0_subject = $1
         AND e.track_id = $2
         AND e.input_hash = $3
         AND e.status = 'running'
         AND t.id = e.track_id`,
      [auth0Subject, job.trackId, job.inputHash, errorCode],
    );
  }
}

export async function countPendingEmbeddingJobs(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<number> {
  const result = await database(executor).query<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM track_embeddings AS e
     INNER JOIN music_tracks AS t ON t.id = e.track_id
     INNER JOIN app_users AS u ON u.id = t.user_id
     WHERE u.auth0_subject = $1 AND e.status IN ('pending', 'running')`,
    [auth0Subject],
  );
  return result.rows[0]?.count ?? 0;
}

export async function countFailedEmbeddingJobs(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<number> {
  const result = await database(executor).query<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM track_embeddings AS e
     INNER JOIN music_tracks AS t ON t.id = e.track_id
     INNER JOIN app_users AS u ON u.id = t.user_id
     WHERE u.auth0_subject = $1 AND e.status = 'failed'`,
    [auth0Subject],
  );
  return result.rows[0]?.count ?? 0;
}
