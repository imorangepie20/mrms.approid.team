import type { PositionedTrack } from "@/lib/music/library-types";
import type { TransactionExecutor } from "@/lib/db/music-library";
import { getDatabasePool } from "@/lib/db/pool";

export async function stageImportedTidalTracks(
  _auth0Subject: string,
  tracks: PositionedTrack[],
  executor: TransactionExecutor = getDatabasePool(),
): Promise<number> {
  if (tracks.length === 0) return 0;
  const run = await executor.query<{ id: string }>(
    `INSERT INTO ems_ingest_runs (run_type, status, request_budget, requested_count)
     VALUES ('user_import', 'completed', 0, $1)
     RETURNING id`,
    [tracks.length],
  );
  const runId = run.rows[0]?.id;
  if (!runId) throw new Error("ems_user_import_run_missing");
  for (const [sequence, item] of tracks.entries()) {
    const { track } = item;
    await executor.query(
      `INSERT INTO ems_ingest_candidates
        (run_id, sequence_no, candidate_key, recording_mbid, isrc, title, artist, album,
         duration_ms, selection_bucket, selection_score, resolver_status, tidal_id)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, 'user_import', 1, 'matched', $9)
       ON CONFLICT (run_id, candidate_key) DO UPDATE
         SET resolver_status = 'matched', tidal_id = EXCLUDED.tidal_id`,
      [runId, sequence, `tidal:${track.tidalTrackId}`, track.isrc, track.title, track.artistName, track.albumName, track.durationMs, track.tidalTrackId],
    );
  }
  return tracks.length;
}
