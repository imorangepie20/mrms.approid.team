import { describe, expect, it, vi } from "vitest";

import {
  AUDIO_EMBEDDING_DIMENSIONS,
  AUDIO_EMBEDDING_MODEL_ID,
  AUDIO_EMBEDDING_MODEL_REVISION,
  AUDIO_FEATURE_VERSION,
  AUDIO_PREDICTION_LABELS,
  AUDIO_PREDICTION_MODEL_REVISION,
  AUDIO_PREDICTION_VOCABULARY_VERSION,
  type AudioTasteProfileResult,
} from "@/lib/recommendations/audio-taste-profile";

import type { TransactionExecutor } from "./music-library";
import {
  loadAudioTasteProfileDataset,
  refreshAudioTasteProfile,
  replaceAudioTasteProfile,
} from "./audio-taste-profiles";

const profile: AudioTasteProfileResult = {
  algorithmVersion: "audio-taste-v1",
  analyzedTrackCount: 1,
  centroids: [{ clusterIndex: 0, embedding: [0.6, 0.8], trackCount: 1, weight: 1 }],
  coverageRatio: 0.5,
  dimensions: AUDIO_EMBEDDING_DIMENSIONS,
  eligibleTrackCount: 2,
  embeddingModelId: AUDIO_EMBEDDING_MODEL_ID,
  embeddingModelRevision: AUDIO_EMBEDDING_MODEL_REVISION,
  featureVersion: AUDIO_FEATURE_VERSION,
  inputFingerprint: "a".repeat(64),
  predictionFeatures: Object.fromEntries(
    AUDIO_PREDICTION_LABELS.map((label) => [label, 0.5]),
  ) as AudioTasteProfileResult["predictionFeatures"],
  predictionModelRevision: AUDIO_PREDICTION_MODEL_REVISION,
  predictionVocabularyVersion: AUDIO_PREDICTION_VOCABULARY_VERSION,
  summaryFeatures: {
    mfcc: { coefficientMeans: [1], coefficientStandardDeviations: [2] },
    rhythm: { beatCount: 20, bpm: 120, confidence: 2 },
    signal: { clippingRatio: 0, peakLevel: 0.8, rmsEnergy: 0.2, zeroCrossingRate: 0.1 },
    spectral: { centroidHz: 1_000, flatnessDb: -20, rolloffHz: 4_000 },
    tonal: { keys: { C: 1 }, modes: { major: 1 }, strength: 0.8 },
  },
};

function writeExecutor(options: { failCentroid?: boolean } = {}) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    void values;
    if (sql.includes("INSERT INTO user_audio_taste_profiles")) {
      return { rows: [{ id: "profile-a", profile_version: "version-a" }] };
    }
    if (options.failCentroid && sql.includes("INSERT INTO user_audio_taste_centroids")) {
      throw new Error("centroid write failed");
    }
    return { rows: [] };
  });
  return { database: { query } as unknown as TransactionExecutor, query };
}

describe("audio taste profile repository", () => {
  it("loads only active, non-rejected, exactly versioned completed analysis", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void sql;
      void values;
      return { rows: [{
      analyzed_track_id: null,
      eligible_track_count: 3,
      }] };
    });

    await expect(loadAudioTasteProfileDataset(
      "auth0|listener",
      { query } as unknown as TransactionExecutor,
    )).resolves.toEqual({ eligibleTrackCount: 3, inputs: [] });

    const [sql, values] = query.mock.calls[0];
    expect(sql).toMatch(/u\.auth0_subject = \$1/i);
    expect(sql).toMatch(/ems\.status = 'active'/i);
    expect(sql).toMatch(/rejected\.decision = 'reject'/i);
    expect(sql).toMatch(/job\.status = 'completed'/i);
    expect(sql).toMatch(/feature\.feature_version = \$2/i);
    expect(sql).toMatch(/embedding\.model_id = \$3/i);
    expect(sql).toMatch(/embedding\.dimensions = \$5/i);
    expect(sql).toMatch(/prediction\.model_revision = \$6/i);
    expect(sql).toMatch(/prediction\.vocabulary_version = \$7/i);
    expect(values).toEqual([
      "auth0|listener",
      AUDIO_FEATURE_VERSION,
      AUDIO_EMBEDDING_MODEL_ID,
      AUDIO_EMBEDDING_MODEL_REVISION,
      AUDIO_EMBEDDING_DIMENSIONS,
      AUDIO_PREDICTION_MODEL_REVISION,
      AUDIO_PREDICTION_VOCABULARY_VERSION,
      [...AUDIO_PREDICTION_LABELS],
    ]);
  });

  it("atomically replaces centroids and generates an independent profile version", async () => {
    const { database, query } = writeExecutor();

    await expect(replaceAudioTasteProfile("auth0|listener", profile, database))
      .resolves.toEqual({ profileVersion: "version-a" });

    const sql = query.mock.calls.map(([text]) => text);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql).toEqual(expect.arrayContaining([
      expect.stringMatching(/profile_version = gen_random_uuid\(\)/i),
      expect.stringMatching(/DELETE FROM user_audio_taste_centroids/i),
      expect.stringMatching(/INSERT INTO user_audio_taste_centroids/i),
      expect.stringMatching(/status = 'completed'/i),
    ]));
    const centroid = query.mock.calls.find(([sqlText]) =>
      sqlText.includes("INSERT INTO user_audio_taste_centroids"),
    );
    expect(centroid?.[1]?.slice(0, 4)).toEqual(["profile-a", 0, 1, 1]);
  });

  it("rolls back the prior completed profile when centroid replacement fails", async () => {
    const { database, query } = writeExecutor({ failCentroid: true });

    await expect(replaceAudioTasteProfile("auth0|listener", profile, database))
      .rejects.toThrow("centroid write failed");

    const sql = query.mock.calls.map(([text]) => text);
    expect(sql).toContain("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
  });

  it("does not create a profile when the eligible set has no completed analysis", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("audio_taste_profile_dataset")) {
        return { rows: [{ analyzed_track_id: null, eligible_track_count: 4 }] };
      }
      throw new Error("unexpected write");
    });

    await expect(refreshAudioTasteProfile(
      "auth0|listener",
      { query } as unknown as TransactionExecutor,
    )).resolves.toEqual({
      analyzedTrackCount: 0,
      coverageRatio: 0,
      created: false,
      eligibleTrackCount: 4,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
