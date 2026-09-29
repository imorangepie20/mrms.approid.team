const SIMILARITY_WEIGHTS = {
  audio: 0.4,
  mood: 0.1,
  rhythm: 0.05,
  text: 0.45,
} as const;

const MOOD_LABELS = new Set([
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
]);

export type HybridScoreInput = {
  audio: number | null;
  candidateBpm: number | null;
  candidatePredictions: Record<string, number> | null;
  catalog: number;
  editorial: number;
  freshness: number;
  profileBpm: number | null;
  profilePredictions: Record<string, number> | null;
  text: number;
};

export type HybridScoreComponents = {
  audio: number | null;
  catalog: number;
  editorial: number;
  freshness: number;
  hybridSimilarity: number;
  mood: number | null;
  rhythm: number | null;
  text: number;
};

export type HybridScoreResult = {
  audioAvailable: boolean;
  baseScore: number;
  components: HybridScoreComponents;
  fallbackUsed: boolean;
  moodAvailable: boolean;
  reasonCodes: string[];
  rhythmAvailable: boolean;
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function moodSimilarity(
  profile: Record<string, number> | null,
  candidate: Record<string, number> | null,
): number | null {
  if (!profile || !candidate) return null;
  const labels = Object.keys(profile).filter((label) =>
    MOOD_LABELS.has(label) && Number.isFinite(candidate[label])
  );
  if (labels.length === 0) return null;
  const meanDifference = labels.reduce((sum, label) =>
    sum + Math.abs(clamp(profile[label]) - clamp(candidate[label])), 0) / labels.length;
  return rounded(1 - meanDifference);
}

function rhythmSimilarity(profileBpm: number | null, candidateBpm: number | null): number | null {
  if (
    profileBpm === null
    || candidateBpm === null
    || !Number.isFinite(profileBpm)
    || !Number.isFinite(candidateBpm)
    || profileBpm <= 0
    || candidateBpm <= 0
  ) {
    return null;
  }
  return rounded(1 - Math.abs(profileBpm - candidateBpm) / Math.max(profileBpm, candidateBpm));
}

export function calculateHybridScore(input: HybridScoreInput): HybridScoreResult {
  const text = clamp(input.text);
  const audio = input.audio === null || !Number.isFinite(input.audio)
    ? null
    : clamp(input.audio);
  const mood = moodSimilarity(input.profilePredictions, input.candidatePredictions);
  const rhythm = rhythmSimilarity(input.profileBpm, input.candidateBpm);
  const available = [
    { value: text, weight: SIMILARITY_WEIGHTS.text },
    ...(audio === null ? [] : [{ value: audio, weight: SIMILARITY_WEIGHTS.audio }]),
    ...(mood === null ? [] : [{ value: mood, weight: SIMILARITY_WEIGHTS.mood }]),
    ...(rhythm === null ? [] : [{ value: rhythm, weight: SIMILARITY_WEIGHTS.rhythm }]),
  ];
  const weight = available.reduce((sum, component) => sum + component.weight, 0);
  const hybridSimilarity = rounded(available.reduce(
    (sum, component) => sum + component.value * component.weight,
    0,
  ) / weight);
  const catalog = clamp(input.catalog);
  const editorial = clamp(input.editorial);
  const freshness = clamp(input.freshness);
  const baseScore = rounded(
    hybridSimilarity * 0.65
    + catalog * 0.15
    + freshness * 0.1
    + editorial * 0.1,
  );
  const reasonCodes = ["text_taste_match"];
  if (audio !== null) reasonCodes.push("audio_timbre_match");
  if (mood !== null) reasonCodes.push("mood_match");
  if (rhythm !== null) reasonCodes.push("rhythm_match");
  const fallbackUsed = audio === null || mood === null || rhythm === null;
  if (audio === null) reasonCodes.push("audio_unavailable_text_fallback");

  return {
    audioAvailable: audio !== null,
    baseScore,
    components: {
      audio,
      catalog,
      editorial,
      freshness,
      hybridSimilarity,
      mood,
      rhythm,
      text,
    },
    fallbackUsed,
    moodAvailable: mood !== null,
    reasonCodes,
    rhythmAvailable: rhythm !== null,
  };
}
