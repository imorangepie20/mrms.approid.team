import { describe, expect, it, vi } from "vitest";

import {
  AUDIO_ANALYSIS_FEATURE_VERSION,
  getAudioAnalysisAdminData,
  getAudioAnalysisTrackDetail,
  requeueAudioAnalysisTrack,
  type QueryExecutor,
} from "./admin";

function executorFrom(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as QueryExecutor;
}

describe("audio analysis admin repository", () => {
  it("maps active-track coverage, versions, errors, throughput, and bounded rows", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [
        { status: "missing", count: 7 },
        { status: "completed", count: 2 },
        { status: "retryable", count: 1 },
      ] })
      .mockResolvedValueOnce({ rows: [{ feature_version: "essentia-dsp-v1", completed_track_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ model_id: "maest", model_revision: "2", dimensions: 2304, completed_track_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ model_id: "musicnn/mood", model_revision: "1", vocabulary_version: "labels-v1", completed_track_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ status: "retryable", error_code: "preview_network", count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ day: "2026-09-28", completed_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ completed_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{
        id: "11111111-1111-4111-8111-111111111111",
        tidal_id: "123",
        title: "Track",
        artist: "Artist",
        album: "Album",
        status: "completed",
        feature_version: "essentia-dsp-v1",
        preview_hash: "a".repeat(64),
        duration_seconds: 30,
        dimensions: 2304,
        attempt_count: 1,
        last_error_code: null,
        completed_at: "2026-09-28T00:00:00.000Z",
        updated_at: "2026-09-28T00:00:00.000Z",
      }] });

    const result = await getAudioAnalysisAdminData(
      { status: "completed", page: 1, limit: 20 },
      executorFrom(query),
      new Date("2026-09-29T12:00:00.000Z"),
    );

    expect(result.coverage).toEqual({ activeTrackCount: 10, stagedTrackCount: 3, completedTrackCount: 2, stagedRatio: 0.3, completedRatio: 0.2 });
    expect(result.statusCounts).toEqual({ missing: 7, pending: 0, running: 0, completed: 2, retryable: 1, failed: 0 });
    expect(result.embeddingModelVersions[0]).toMatchObject({ modelRevision: "2", dimensions: 2304, completedTrackCount: 2 });
    expect(result.errorCodes).toEqual([{ status: "retryable", code: "preview_network", count: 1 }]);
    expect(result.throughput.days).toHaveLength(7);
    expect(result.throughput.days.at(-2)).toEqual({ date: "2026-09-28", completedCount: 2 });
    expect(result.tracks.items[0]).toMatchObject({ previewHash: "a".repeat(64), dimensions: 2304 });
    expect(JSON.stringify(result)).not.toMatch(/previewUrl|signedUrl|providerToken|embeddingValues/);
    expect(String(query.mock.calls.at(-1)?.[0])).toContain("LIMIT $2 OFFSET $3");
  });

  it("returns detail metadata without selecting or returning embedding values", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{
        id: "11111111-1111-4111-8111-111111111111", tidal_id: "123", title: "Track", artist: "Artist", album: null,
        status: "completed", feature_version: "essentia-dsp-v1", preview_hash: "b".repeat(64), duration_seconds: 30,
        dimensions: 2304, attempt_count: 1, last_error_code: null, completed_at: "2026-09-29T00:00:00.000Z",
        updated_at: "2026-09-29T00:00:00.000Z", claimed_at: null, lease_expires_at: null, next_attempt_at: null, last_error_at: null,
      }] })
      .mockResolvedValueOnce({ rows: [{
        preview_hash: "b".repeat(64), feature_version: "essentia-dsp-v1", duration_seconds: 30, sample_rate: 16000,
        channel_count: 1, segment_count: 3, coverage_ratio: 1, whole_features: { rms: 0.1 }, segment_features: [],
        summary_features: { segmentCount: 3 }, dsp_features: { rhythm: { tempoBpm: 120 } }, created_at: "2026-09-29T00:00:00.000Z",
      }] })
      .mockResolvedValueOnce({ rows: [{ model_id: "maest", model_revision: "2", preview_hash: "b".repeat(64), dimensions: 2304, normalization: "l2", created_at: "2026-09-29T00:00:00.000Z" }] })
      .mockResolvedValueOnce({ rows: [{ model_id: "musicnn/mood", model_revision: "1", vocabulary_version: "labels-v1", label: "happy", probability: 0.75 }] });

    const result = await getAudioAnalysisTrackDetail("11111111-1111-4111-8111-111111111111", executorFrom(query));

    expect(result.feature).toMatchObject({ durationSeconds: 30, sampleRate: 16000, dsp: { rhythm: { tempoBpm: 120 } } });
    expect(result.embeddings).toEqual([expect.objectContaining({ dimensions: 2304, normalization: "l2" })]);
    expect(result.predictions).toEqual([expect.objectContaining({ label: "happy", probability: 0.75 })]);
    expect(String(query.mock.calls[2][0])).not.toMatch(/\bembedding\b\s*(,|FROM)/i);
    expect(JSON.stringify(result)).not.toContain("values");
  });

  it("only requeues one eligible track for the fixed feature version", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      requested_track_id: "11111111-1111-4111-8111-111111111111",
      track_id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      feature_version: AUDIO_ANALYSIS_FEATURE_VERSION,
      updated_at: "2026-09-29T00:00:00.000Z",
    }] });
    const executor = executorFrom(query);

    await expect(requeueAudioAnalysisTrack("11111111-1111-4111-8111-111111111111", AUDIO_ANALYSIS_FEATURE_VERSION, executor)).resolves.toMatchObject({ status: "pending" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE track.id = $1"), ["11111111-1111-4111-8111-111111111111", AUDIO_ANALYSIS_FEATURE_VERSION]);
    await expect(requeueAudioAnalysisTrack("11111111-1111-4111-8111-111111111111", "other-version", executor)).rejects.toThrow("invalid_audio_analysis_feature_version");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not reset an actively running job", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      requested_track_id: "11111111-1111-4111-8111-111111111111",
      track_id: null, status: null, feature_version: null, updated_at: null,
    }] });
    await expect(requeueAudioAnalysisTrack(
      "11111111-1111-4111-8111-111111111111",
      AUDIO_ANALYSIS_FEATURE_VERSION,
      executorFrom(query),
    )).rejects.toThrow("audio_analysis_track_busy");
    expect(String(query.mock.calls[0][0])).toContain("ems_track_audio_jobs.status <> 'running'");
  });
});
