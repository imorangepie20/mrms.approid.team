export const ATTRIBUTE_RANKING = {
  minimumSample: 20,
  languageFullShare: 0.15,
  genreFullShare: 0.1,
  languageFloor: 0.55,
  genreFloor: 0.7,
  rejectWeight: -0.5,
  explorationSlots: 2,
} as const; // 출발값. Task 10 평가로 조정한다.

const NEUTRAL_LANGUAGES = new Set(["unknown", "zxx"]);
const MINIMUM_EXPLORATION_LIMIT = 6;

export type TrackAttributes = { language: string; genreBuckets: Record<string, number> };
export type DistributionInput = TrackAttributes & { weight: number };
export type AttributeDistribution = {
  languages: Record<string, number>;
  genres: Record<string, number>;
  languageSample: number;
  genreSample: number;
};
export type AttributeFit = {
  languageFit: number | null;
  genreFit: number | null;
  multiplier: number;
  mismatchKey: string | null;
  reasonCodes: string[];
};

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function normalize(sums: Record<string, number>): Record<string, number> {
  const positive = Object.entries(sums).filter(([, value]) => value > 0);
  const total = positive.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return {};
  return Object.fromEntries(positive.map(([key, value]) => [key, rounded(value / total)]));
}

export function buildAttributeDistribution(items: DistributionInput[]): AttributeDistribution {
  const languageSums: Record<string, number> = {};
  const genreSums: Record<string, number> = {};
  let languageSample = 0;
  let genreSample = 0;
  for (const item of items) {
    if (!Number.isFinite(item.weight)) continue;
    const positive = item.weight > 0;
    if (!NEUTRAL_LANGUAGES.has(item.language)) {
      languageSums[item.language] = (languageSums[item.language] ?? 0) + item.weight;
      if (positive) languageSample += 1;
    }
    const buckets = Object.entries(item.genreBuckets);
    if (buckets.length > 0) {
      for (const [bucket, share] of buckets) {
        genreSums[bucket] = (genreSums[bucket] ?? 0) + share * item.weight;
      }
      if (positive) genreSample += 1;
    }
  }
  return {
    genres: normalize(genreSums),
    genreSample,
    languages: normalize(languageSums),
    languageSample,
  };
}

function dimensionMultiplier(floor: number, fit: number | null): number {
  return fit === null ? 1 : floor + (1 - floor) * fit;
}

export function scoreAttributeFit(
  distribution: AttributeDistribution,
  candidate: TrackAttributes | null,
): AttributeFit {
  let languageFit: number | null = null;
  let genreFit: number | null = null;
  let languageKey: string | null = null;
  let genreKey: string | null = null;

  if (
    candidate
    && !NEUTRAL_LANGUAGES.has(candidate.language)
    && distribution.languageSample >= ATTRIBUTE_RANKING.minimumSample
  ) {
    const share = distribution.languages[candidate.language] ?? 0;
    languageFit = rounded(Math.min(1, share / ATTRIBUTE_RANKING.languageFullShare));
    if (languageFit < 1) languageKey = `lang:${candidate.language}`;
  }

  if (candidate && distribution.genreSample >= ATTRIBUTE_RANKING.minimumSample) {
    const buckets = Object.entries(candidate.genreBuckets).filter(([, weight]) => weight > 0);
    const total = buckets.reduce((sum, [, weight]) => sum + weight, 0);
    if (total > 0) {
      let weighted = 0;
      let worst: { bucket: string; weight: number } | null = null;
      for (const [bucket, weight] of buckets) {
        const bucketFit = Math.min(1, (distribution.genres[bucket] ?? 0) / ATTRIBUTE_RANKING.genreFullShare);
        weighted += bucketFit * weight;
        if (bucketFit < 1 && (worst === null || weight > worst.weight)) worst = { bucket, weight };
      }
      genreFit = rounded(weighted / total);
      if (genreFit < 1 && worst) genreKey = `genre:${worst.bucket}`;
    }
  }

  const reasonCodes: string[] = [];
  if (languageFit !== null && languageFit < 1) reasonCodes.push("language_mismatch");
  if (genreFit !== null && genreFit < 1) reasonCodes.push("genre_mismatch");

  return {
    genreFit,
    languageFit,
    mismatchKey: languageKey ?? genreKey,
    multiplier: rounded(
      dimensionMultiplier(ATTRIBUTE_RANKING.languageFloor, languageFit)
      * dimensionMultiplier(ATTRIBUTE_RANKING.genreFloor, genreFit),
    ),
    reasonCodes,
  };
}

export function placeExplorationSlots<T extends { id: string; fit: AttributeFit; baseScore: number }>(
  ranked: T[],
  limit: number,
): Array<T & { exploration: boolean }> {
  const plain = (candidate: T) => ({ ...candidate, exploration: false });
  if (limit < MINIMUM_EXPLORATION_LIMIT) return ranked.slice(0, limit).map(plain);

  const pool = ranked
    .slice(Math.max(0, limit - ATTRIBUTE_RANKING.explorationSlots))
    .filter((candidate) => candidate.fit.mismatchKey !== null)
    .sort((a, b) => b.baseScore - a.baseScore || a.id.localeCompare(b.id));
  const explorers: T[] = [];
  const seenKeys = new Set<string>();
  for (const candidate of pool) {
    if (explorers.length >= ATTRIBUTE_RANKING.explorationSlots) break;
    const key = candidate.fit.mismatchKey as string;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    explorers.push(candidate);
  }

  const explorerIds = new Set(explorers.map((candidate) => candidate.id));
  const output = ranked
    .filter((candidate) => !explorerIds.has(candidate.id))
    .slice(0, limit - explorers.length)
    .map(plain);
  const positions = [Math.round(limit / 3), Math.round((2 * limit) / 3)];
  explorers.forEach((candidate, index) => {
    const exploring = {
      ...candidate,
      exploration: true,
      fit: { ...candidate.fit, reasonCodes: [...candidate.fit.reasonCodes, "exploration"] },
    };
    output.splice(Math.min(positions[index] - 1, output.length), 0, exploring);
  });
  return output;
}
