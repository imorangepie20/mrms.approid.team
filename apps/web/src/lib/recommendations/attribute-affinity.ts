export const ATTRIBUTE_RANKING = {
  minimumSample: 20,
  languageMinCoverage: 0.3,
  languageFullShare: 0.15,
  genreFullShare: 0.1,
  languageFloor: 0.55,
  genreFloor: 0.7,
  rejectWeight: -0.5,
  explorationSlots: 2,
} as const; // 출발값. Task 10 평가로 조정한다.

const NEUTRAL_LANGUAGES = new Set(["unknown", "zxx"]);
const UNKNOWN_LANGUAGE = "unknown";
const NO_LANGUAGE = "zxx";
const MINIMUM_EXPLORATION_LIMIT = 6;

export type TrackAttributes = { language: string; genreBuckets: Record<string, number> };
export type DistributionInput = TrackAttributes & { weight: number; languageSource?: string | null };
export type AttributeDistribution = {
  /** 언어 점유율. 분모는 zxx를 뺀 모든 항목이고 `unknown`도 자기 키로 들어간다(후보와는 맞지 않는다). */
  languages: Record<string, number>;
  genres: Record<string, number>;
  /** 언어가 확인된(unknown·zxx 제외) 양의 가중치 항목 수. */
  languageSample: number;
  /** 언어 확인 비율 = languageSample ÷ zxx를 뺀 양의 가중치 항목 수. 항목이 없으면 0. */
  languageCoverage: number;
  /** zxx를 뺀 양의 가중치 항목의 `language_source`별 개수. 출처가 없으면 `none`. */
  languageSources: Record<string, number>;
  genreSample: number;
};
export type AttributeFit = {
  languageFit: number | null;
  genreFit: number | null;
  multiplier: number;
  mismatchKey: string | null;
  reasonCodes: string[];
  /** 탐색 슬롯 중복 판정용: 사용자에게 낯선 후보 언어. 언어가 맞거나 판정하지 않으면 null. */
  language?: string | null;
  /** 탐색 슬롯 중복 판정용: 후보의 가장 큰 장르 버킷이 사용자에게 낯설 때만 그 버킷. */
  dominantGenre?: string | null;
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
  const languageSources: Record<string, number> = {};
  let languageSample = 0;
  let languageItems = 0;
  let genreSample = 0;
  for (const item of items) {
    if (!Number.isFinite(item.weight)) continue;
    const positive = item.weight > 0;
    if (item.language !== NO_LANGUAGE) {
      // unknown stays in the denominator so a script-only fallback cannot inflate known shares.
      languageSums[item.language] = (languageSums[item.language] ?? 0) + item.weight;
      if (positive) {
        languageItems += 1;
        if (item.language !== UNKNOWN_LANGUAGE) languageSample += 1;
        const source = item.languageSource || "none";
        languageSources[source] = (languageSources[source] ?? 0) + 1;
      }
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
    languageCoverage: languageItems > 0 ? rounded(languageSample / languageItems) : 0,
    languageSample,
    languageSources,
    languages: normalize(languageSums),
  };
}

/** 언어 차원은 표본이 충분하고 언어 확인 비율이 기준 이상일 때만 쓴다. */
export function languageDimensionActive(distribution: AttributeDistribution): boolean {
  return distribution.languageSample >= ATTRIBUTE_RANKING.minimumSample
    && distribution.languageCoverage >= ATTRIBUTE_RANKING.languageMinCoverage;
}

function dominantBucket(buckets: Record<string, number>): string | null {
  let best: [string, number] | null = null;
  for (const entry of Object.entries(buckets)) {
    if (!(entry[1] > 0)) continue;
    if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) best = entry;
  }
  return best?.[0] ?? null;
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
  let unfamiliarDominantGenre: string | null = null;

  if (
    candidate
    && !NEUTRAL_LANGUAGES.has(candidate.language)
    && languageDimensionActive(distribution)
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
      const dominant = dominantBucket(candidate.genreBuckets);
      if (dominant && (distribution.genres[dominant] ?? 0) < ATTRIBUTE_RANKING.genreFullShare) {
        unfamiliarDominantGenre = dominant;
      }
    }
  }

  const reasonCodes: string[] = [];
  if (languageFit !== null && languageFit < 1) reasonCodes.push("language_mismatch");
  if (genreFit !== null && genreFit < 1) reasonCodes.push("genre_mismatch");

  return {
    dominantGenre: unfamiliarDominantGenre,
    genreFit,
    language: languageKey && candidate ? candidate.language : null,
    languageFit,
    mismatchKey: languageKey ?? genreKey,
    multiplier: rounded(
      dimensionMultiplier(ATTRIBUTE_RANKING.languageFloor, languageFit)
      * dimensionMultiplier(ATTRIBUTE_RANKING.genreFloor, genreFit),
    ),
    reasonCodes,
  };
}

function explorationKeys(fit: AttributeFit): string[] {
  const keys = new Set<string>([fit.mismatchKey as string]);
  if (fit.language) keys.add(`lang:${fit.language}`);
  if (fit.dominantGenre) keys.add(`genre:${fit.dominantGenre}`);
  return [...keys];
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
    // 같은 낯선 언어·장르가 두 슬롯을 다 차지하지 않게 한다(spec 4.3): mismatchKey 종류가 달라도
    // 후보의 낯선 언어나 낯선 대표 장르가 겹치면 건너뛴다. 사용자에게 익숙한 차원은 비교하지 않는다.
    const keys = explorationKeys(candidate.fit);
    if (keys.some((key) => seenKeys.has(key))) continue;
    keys.forEach((key) => seenKeys.add(key));
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
