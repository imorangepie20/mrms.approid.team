import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import {
  AUDIO_ANALYSIS_FEATURE_VERSION,
  getAudioAnalysisAdminData,
  getAudioAnalysisTrackDetail,
  requeueAudioAnalysisTrack,
  type QueryExecutor,
} from "./admin";

const databaseUrl = process.env.AUDIO_ANALYSIS_TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(databaseUrl));
const trackId = "11111111-1111-4111-8111-111111111111";
let pool: Pool;

suite("audio analysis admin PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query(`
      INSERT INTO ems_tracks (id, tidal_id, title, artist, album, duration_ms, status, match_confidence)
      VALUES ($1, '123456', 'Integration Track', 'Integration Artist', 'Integration Album', 180000, 'active', 1)
    `, [trackId]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("executes aggregate, detail, and bounded requeue queries against PostgreSQL", async () => {
    const executor = pool as unknown as QueryExecutor;
    const before = await getAudioAnalysisAdminData({}, executor, new Date("2026-09-29T00:00:00.000Z"));
    expect(before.statusCounts.missing).toBe(1);

    await expect(requeueAudioAnalysisTrack(trackId, AUDIO_ANALYSIS_FEATURE_VERSION, executor)).resolves.toMatchObject({ trackId, status: "pending" });
    await expect(getAudioAnalysisTrackDetail(trackId, executor)).resolves.toMatchObject({ id: trackId, status: "pending", featureVersion: AUDIO_ANALYSIS_FEATURE_VERSION });

    await pool.query("UPDATE ems_track_audio_jobs SET status = 'running', claimed_at = now(), lease_expires_at = now() + interval '5 minutes' WHERE track_id = $1", [trackId]);
    await expect(requeueAudioAnalysisTrack(trackId, AUDIO_ANALYSIS_FEATURE_VERSION, executor)).rejects.toThrow("audio_analysis_track_busy");
  });
});
