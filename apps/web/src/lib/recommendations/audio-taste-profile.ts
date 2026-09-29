import { createHash } from "node:crypto";

import {
  buildTasteProfile,
  prepareTasteProfileInputs,
  type TasteCentroid,
  type TasteProfileInput,
  type WeightedTasteProfileInput,
} from "./taste-profile";

export const AUDIO_FEATURE_VERSION = "essentia-dsp-v1";
export const AUDIO_EMBEDDING_MODEL_ID = "essentia/discogs-maest-30s-pw-519l";
export const AUDIO_EMBEDDING_MODEL_REVISION = "2";
export const AUDIO_EMBEDDING_DIMENSIONS = 2304;
export const AUDIO_PREDICTION_MODEL_REVISION = "1";
export const AUDIO_PREDICTION_VOCABULARY_VERSION = "2";
export const AUDIO_TASTE_ALGORITHM_VERSION = "audio-taste-v1";

export const AUDIO_PREDICTION_LABELS = [
  "danceable",
  "not_danceable",
  "acoustic",
  "non_acoustic",
  "electronic",
  "non_electronic",
  "aggressive",
  "not_aggressive",
  "happy",
  "non_happy",
  "relaxed",
  "non_relaxed",
  "sad",
  "non_sad",
  "party",
  "non_party",
  "instrumental",
  "voice",
] as const;

type AudioPredictionLabel = (typeof AUDIO_PREDICTION_LABELS)[number];

export type AudioTastePrediction = {
  label: string;
  modelId: string;
  modelRevision: string;
  probability: number;
  vocabularyVersion: string;
};

export type AudioTasteProfileInput = TasteProfileInput & {
  dimensions: number;
  dspFeatures: {
    errors: unknown[];
    mfcc: {
      coefficientMeans: number[];
      coefficientStandardDeviations: number[];
    };
    rhythm: {
      beatCount: number;
      bpm: number;
      confidence: number;
    };
    spectral: {
      centroidHz: { mean: number };
      flatnessDb: { mean: number };
      rolloffHz: { mean: number };
    };
    tonal: {
      key: string;
      mode: string;
      strength: number;
    };
  };
  embeddingModelId: string;
  embeddingModelRevision: string;
  featureVersion: string;
  normalization: string;
  predictions: AudioTastePrediction[];
  previewHash: string;
  wholeFeatures: {
    clippingRatio: number;
    peakLevel: number;
    rmsEnergy: number;
    zeroCrossingRate: number;
  };
};

export type AudioTasteSummaryFeatures = {
  mfcc: {
    coefficientMeans: number[];
    coefficientStandardDeviations: number[];
  };
  rhythm: {
    beatCount: number;
    bpm: number;
    confidence: number;
  };
  signal: {
    clippingRatio: number;
    peakLevel: number;
    rmsEnergy: number;
    zeroCrossingRate: number;
  };
  spectral: {
    centroidHz: number;
    flatnessDb: number;
    rolloffHz: number;
  };
  tonal: {
    keys: Record<string, number>;
    modes: Record<string, number>;
    strength: number;
  };
};

export type AudioTasteProfileResult = {
  algorithmVersion: typeof AUDIO_TASTE_ALGORITHM_VERSION;
  analyzedTrackCount: number;
  centroids: TasteCentroid[];
  coverageRatio: number;
  dimensions: typeof AUDIO_EMBEDDING_DIMENSIONS;
  eligibleTrackCount: number;
  embeddingModelId: typeof AUDIO_EMBEDDING_MODEL_ID;
  embeddingModelRevision: typeof AUDIO_EMBEDDING_MODEL_REVISION;
  featureVersion: typeof AUDIO_FEATURE_VERSION;
  inputFingerprint: string;
  predictionFeatures: Record<AudioPredictionLabel, number>;
  predictionModelRevision: typeof AUDIO_PREDICTION_MODEL_REVISION;
  predictionVocabularyVersion: typeof AUDIO_PREDICTION_VOCABULARY_VERSION;
  summaryFeatures: AudioTasteSummaryFeatures;
};

type WeightedAudioInput = WeightedTasteProfileInput<AudioTasteProfileInput>;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function validatePredictions(predictions: AudioTastePrediction[]): void {
  if (predictions.length !== AUDIO_PREDICTION_LABELS.length) {
    throw new Error("audio_taste_profile_predictions_invalid");
  }
  const expected = new Set<string>(AUDIO_PREDICTION_LABELS);
  const seen = new Set<string>();
  for (const prediction of predictions) {
    if (
      !expected.has(prediction.label)
      || seen.has(prediction.label)
      || !prediction.modelId.startsWith("essentia/msd-musicnn/")
      || prediction.modelRevision !== AUDIO_PREDICTION_MODEL_REVISION
      || prediction.vocabularyVersion !== AUDIO_PREDICTION_VOCABULARY_VERSION
      || !finite(prediction.probability)
      || prediction.probability < 0
      || prediction.probability > 1
    ) {
      throw new Error("audio_taste_profile_predictions_invalid");
    }
    seen.add(prediction.label);
  }
}

function validateFeatures(input: AudioTasteProfileInput): void {
  const mfccMeans = input.dspFeatures.mfcc.coefficientMeans;
  const mfccDeviations = input.dspFeatures.mfcc.coefficientStandardDeviations;
  const scalars = [
    input.dspFeatures.rhythm.beatCount,
    input.dspFeatures.rhythm.bpm,
    input.dspFeatures.rhythm.confidence,
    input.dspFeatures.spectral.centroidHz.mean,
    input.dspFeatures.spectral.flatnessDb.mean,
    input.dspFeatures.spectral.rolloffHz.mean,
    input.dspFeatures.tonal.strength,
    input.wholeFeatures.clippingRatio,
    input.wholeFeatures.peakLevel,
    input.wholeFeatures.rmsEnergy,
    input.wholeFeatures.zeroCrossingRate,
  ];
  if (
    !input.dspFeatures.tonal.key
    || !input.dspFeatures.tonal.mode
    || mfccMeans.length === 0
    || mfccMeans.length !== mfccDeviations.length
    || scalars.some((value) => !finite(value))
    || mfccMeans.some((value) => !finite(value))
    || mfccDeviations.some((value) => !finite(value))
  ) {
    throw new Error("audio_taste_profile_features_invalid");
  }
}

function validateInput(input: AudioTasteProfileInput): void {
  if (
    input.featureVersion !== AUDIO_FEATURE_VERSION
    || input.embeddingModelId !== AUDIO_EMBEDDING_MODEL_ID
    || input.embeddingModelRevision !== AUDIO_EMBEDDING_MODEL_REVISION
    || input.dimensions !== AUDIO_EMBEDDING_DIMENSIONS
    || input.embedding.length !== AUDIO_EMBEDDING_DIMENSIONS
    || input.normalization !== "l2"
    || input.embedding.some((value) => !finite(value))
    || !/^[0-9a-f]{64}$/.test(input.previewHash)
  ) {
    throw new Error("audio_taste_profile_model_mismatch");
  }
  const norm = Math.sqrt(input.embedding.reduce((sum, value) => sum + value * value, 0));
  if (!finite(norm) || Math.abs(norm - 1) > 1e-5) {
    throw new Error("audio_taste_profile_model_mismatch");
  }
  validatePredictions(input.predictions);
  validateFeatures(input);
}

function weightedAverage(
  inputs: WeightedAudioInput[],
  select: (input: WeightedAudioInput) => number,
): number {
  const totalWeight = inputs.reduce((sum, input) => sum + input.weight, 0);
  return inputs.reduce((sum, input) => sum + select(input) * input.weight, 0) / totalWeight;
}

function weightedArray(
  inputs: WeightedAudioInput[],
  select: (input: WeightedAudioInput) => number[],
): number[] {
  const length = select(inputs[0]).length;
  if (inputs.some((input) => select(input).length !== length)) {
    throw new Error("audio_taste_profile_features_invalid");
  }
  return Array.from({ length }, (_, index) =>
    weightedAverage(inputs, (input) => select(input)[index])
  );
}

function weightedDistribution(
  inputs: WeightedAudioInput[],
  select: (input: WeightedAudioInput) => string,
): Record<string, number> {
  const totalWeight = inputs.reduce((sum, input) => sum + input.weight, 0);
  const distribution = new Map<string, number>();
  for (const input of inputs) {
    const key = select(input);
    distribution.set(key, (distribution.get(key) ?? 0) + input.weight / totalWeight);
  }
  return Object.fromEntries([...distribution.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ));
}

function predictionProbability(input: WeightedAudioInput, label: string): number {
  const prediction = input.predictions.find((item) => item.label === label);
  if (!prediction) throw new Error("audio_taste_profile_predictions_invalid");
  return prediction.probability;
}

function buildFingerprint(inputs: WeightedAudioInput[]): string {
  const payload = {
    algorithmVersion: AUDIO_TASTE_ALGORITHM_VERSION,
    dimensions: AUDIO_EMBEDDING_DIMENSIONS,
    embeddingModelId: AUDIO_EMBEDDING_MODEL_ID,
    embeddingModelRevision: AUDIO_EMBEDDING_MODEL_REVISION,
    featureVersion: AUDIO_FEATURE_VERSION,
    predictionModelRevision: AUDIO_PREDICTION_MODEL_REVISION,
    predictionVocabularyVersion: AUDIO_PREDICTION_VOCABULARY_VERSION,
    tracks: inputs.map((input) => ({
      feedbackWeight: input.feedbackWeight ?? 1,
      playlistCount: Math.max(1, Math.trunc(input.playlistCount)),
      previewHash: input.previewHash,
      trackId: input.trackId,
      weight: input.weight,
    })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildAudioTasteProfile(
  rawInputs: AudioTasteProfileInput[],
  eligibleTrackCount: number,
  seed = 20260929,
): AudioTasteProfileResult {
  if (rawInputs.length === 0) {
    throw new Error("audio_taste_profile_minimum_not_met");
  }
  rawInputs.forEach(validateInput);
  const sorted = [...rawInputs].sort((left, right) => left.trackId.localeCompare(right.trackId));
  const inputs = prepareTasteProfileInputs(sorted);
  if (
    !Number.isInteger(eligibleTrackCount)
    || eligibleTrackCount < 1
    || inputs.length > eligibleTrackCount
  ) {
    throw new Error("audio_taste_profile_coverage_invalid");
  }
  const profile = buildTasteProfile(sorted, seed, 1);
  const predictionFeatures = Object.fromEntries(AUDIO_PREDICTION_LABELS.map((label) => [
    label,
    weightedAverage(inputs, (input) => predictionProbability(input, label)),
  ])) as Record<AudioPredictionLabel, number>;

  return {
    algorithmVersion: AUDIO_TASTE_ALGORITHM_VERSION,
    analyzedTrackCount: inputs.length,
    centroids: profile.centroids,
    coverageRatio: inputs.length / eligibleTrackCount,
    dimensions: AUDIO_EMBEDDING_DIMENSIONS,
    eligibleTrackCount,
    embeddingModelId: AUDIO_EMBEDDING_MODEL_ID,
    embeddingModelRevision: AUDIO_EMBEDDING_MODEL_REVISION,
    featureVersion: AUDIO_FEATURE_VERSION,
    inputFingerprint: buildFingerprint(inputs),
    predictionFeatures,
    predictionModelRevision: AUDIO_PREDICTION_MODEL_REVISION,
    predictionVocabularyVersion: AUDIO_PREDICTION_VOCABULARY_VERSION,
    summaryFeatures: {
      mfcc: {
        coefficientMeans: weightedArray(inputs, (input) => input.dspFeatures.mfcc.coefficientMeans),
        coefficientStandardDeviations: weightedArray(
          inputs,
          (input) => input.dspFeatures.mfcc.coefficientStandardDeviations,
        ),
      },
      rhythm: {
        beatCount: weightedAverage(inputs, (input) => input.dspFeatures.rhythm.beatCount),
        bpm: weightedAverage(inputs, (input) => input.dspFeatures.rhythm.bpm),
        confidence: weightedAverage(inputs, (input) => input.dspFeatures.rhythm.confidence),
      },
      signal: {
        clippingRatio: weightedAverage(inputs, (input) => input.wholeFeatures.clippingRatio),
        peakLevel: weightedAverage(inputs, (input) => input.wholeFeatures.peakLevel),
        rmsEnergy: weightedAverage(inputs, (input) => input.wholeFeatures.rmsEnergy),
        zeroCrossingRate: weightedAverage(inputs, (input) => input.wholeFeatures.zeroCrossingRate),
      },
      spectral: {
        centroidHz: weightedAverage(inputs, (input) => input.dspFeatures.spectral.centroidHz.mean),
        flatnessDb: weightedAverage(inputs, (input) => input.dspFeatures.spectral.flatnessDb.mean),
        rolloffHz: weightedAverage(inputs, (input) => input.dspFeatures.spectral.rolloffHz.mean),
      },
      tonal: {
        keys: weightedDistribution(inputs, (input) => input.dspFeatures.tonal.key),
        modes: weightedDistribution(inputs, (input) => input.dspFeatures.tonal.mode),
        strength: weightedAverage(inputs, (input) => input.dspFeatures.tonal.strength),
      },
    },
  };
}
