import { describe, expect, it } from "vitest";

import {
  AUDIO_EMBEDDING_DIMENSIONS,
  AUDIO_EMBEDDING_MODEL_ID,
  AUDIO_EMBEDDING_MODEL_REVISION,
  AUDIO_FEATURE_VERSION,
  AUDIO_PREDICTION_MODEL_REVISION,
  AUDIO_PREDICTION_VOCABULARY_VERSION,
  buildAudioTasteProfile,
  type AudioTasteProfileInput,
} from "./audio-taste-profile";

const labels = [
  "danceable", "not_danceable", "acoustic", "non_acoustic",
  "electronic", "non_electronic", "aggressive", "not_aggressive",
  "happy", "non_happy", "relaxed", "non_relaxed", "sad", "non_sad",
  "party", "non_party", "instrumental", "voice",
];

function vector(index: number): number[] {
  return Array.from({ length: AUDIO_EMBEDDING_DIMENSIONS }, (_, item) => item === index ? 1 : 0);
}

function input(options: {
  artist?: string;
  bpm: number;
  embeddingIndex: number;
  feedbackWeight?: number;
  key: string;
  playlistCount?: number;
  prediction: number;
  previewCharacter: string;
  trackId: string;
}): AudioTasteProfileInput {
  return {
    artist: options.artist ?? options.trackId,
    dimensions: AUDIO_EMBEDDING_DIMENSIONS,
    dspFeatures: {
      errors: [],
      mfcc: {
        coefficientMeans: [options.bpm / 10, options.bpm / 20],
        coefficientStandardDeviations: [1, 2],
      },
      rhythm: { beatCount: Math.round(options.bpm / 5), bpm: options.bpm, confidence: 2 },
      spectral: {
        centroidHz: { mean: options.bpm * 10 },
        flatnessDb: { mean: options.bpm / 1000 },
        rolloffHz: { mean: options.bpm * 20 },
      },
      tonal: { key: options.key, mode: "major", strength: 0.8 },
    },
    embedding: vector(options.embeddingIndex),
    embeddingModelId: AUDIO_EMBEDDING_MODEL_ID,
    embeddingModelRevision: AUDIO_EMBEDDING_MODEL_REVISION,
    featureVersion: AUDIO_FEATURE_VERSION,
    feedbackWeight: options.feedbackWeight,
    normalization: "l2",
    playlistCount: options.playlistCount ?? 1,
    predictions: labels.map((label, index) => ({
      label,
      modelId: `essentia/msd-musicnn/${Math.floor(index / 2)}`,
      modelRevision: AUDIO_PREDICTION_MODEL_REVISION,
      probability: index % 2 === 0 ? options.prediction : 1 - options.prediction,
      vocabularyVersion: AUDIO_PREDICTION_VOCABULARY_VERSION,
    })),
    previewHash: options.previewCharacter.repeat(64),
    trackId: options.trackId,
    wholeFeatures: {
      clippingRatio: 0.01,
      peakLevel: options.bpm / 100,
      rmsEnergy: options.bpm / 1000,
      zeroCrossingRate: options.bpm / 10_000,
    },
  };
}

describe("audio taste profile", () => {
  it("requires at least one analyzed track", () => {
    expect(() => buildAudioTasteProfile([], 8)).toThrow("audio_taste_profile_minimum_not_met");
  });

  it("builds a normalized centroid, coverage, weighted summaries, and predictions", () => {
    const result = buildAudioTasteProfile([
      input({ bpm: 100, embeddingIndex: 0, key: "C", prediction: 0.2, previewCharacter: "a", trackId: "a" }),
      input({ bpm: 160, embeddingIndex: 1, feedbackWeight: 2, key: "D", prediction: 0.8, previewCharacter: "b", trackId: "b" }),
    ], 8);

    expect(result.eligibleTrackCount).toBe(8);
    expect(result.analyzedTrackCount).toBe(2);
    expect(result.coverageRatio).toBe(0.25);
    expect(result.centroids).toHaveLength(1);
    expect(result.centroids[0].embedding[0]).toBeCloseTo(1 / Math.sqrt(5), 12);
    expect(result.centroids[0].embedding[1]).toBeCloseTo(2 / Math.sqrt(5), 12);
    expect(result.summaryFeatures.rhythm.bpm).toBeCloseTo(140, 12);
    expect(result.summaryFeatures.signal.rmsEnergy).toBeCloseTo(0.14, 12);
    expect(result.summaryFeatures.tonal.keys).toEqual({ C: 1 / 3, D: 2 / 3 });
    expect(result.predictionFeatures.danceable).toBeCloseTo(0.6, 12);
    expect(result.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic across input order and changes fingerprint with preview identity", () => {
    const first = input({ bpm: 100, embeddingIndex: 0, key: "C", prediction: 0.2, previewCharacter: "a", trackId: "a" });
    const second = input({ bpm: 160, embeddingIndex: 1, key: "D", prediction: 0.8, previewCharacter: "b", trackId: "b" });

    const left = buildAudioTasteProfile([first, second], 2);
    const right = buildAudioTasteProfile([second, first], 2);
    const changed = buildAudioTasteProfile([{ ...first, previewHash: "c".repeat(64) }, second], 2);

    expect(left).toEqual(right);
    expect(changed.inputFingerprint).not.toBe(left.inputFingerprint);
  });

  it("rejects mixed model identities and incomplete high-level predictions", () => {
    const valid = input({ bpm: 120, embeddingIndex: 0, key: "A", prediction: 0.5, previewCharacter: "d", trackId: "one" });

    expect(() => buildAudioTasteProfile([{ ...valid, dimensions: 768 }], 1))
      .toThrow("audio_taste_profile_model_mismatch");
    expect(() => buildAudioTasteProfile([{ ...valid, predictions: valid.predictions.slice(1) }], 1))
      .toThrow("audio_taste_profile_predictions_invalid");
  });

  it("does not let analyzed tracks exceed the eligible user set", () => {
    const valid = input({ bpm: 120, embeddingIndex: 0, key: "A", prediction: 0.5, previewCharacter: "e", trackId: "one" });

    expect(() => buildAudioTasteProfile([valid], 0))
      .toThrow("audio_taste_profile_coverage_invalid");
  });
});
