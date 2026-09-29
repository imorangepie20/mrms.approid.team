export type ShadowBaselineCandidate = {
  artist: string;
  id: string;
};

export type ShadowHybridCandidate = {
  artist: string;
  audioAvailable: boolean;
  baseRank: number;
  fallbackUsed: boolean;
  id: string;
  moodAvailable: boolean;
  rhythmAvailable: boolean;
  selectedRank: number;
};

export type ShadowRankingEvaluation = {
  audioCoverageRatio: number;
  candidateCount: number;
  fallbackUsed: boolean;
  hybridTrackIds: string[];
  meanAbsoluteRankDisplacement: number;
  moodCoverageRatio: number;
  overlapAtK: number;
  rhythmCoverageRatio: number;
  sameArtistRatio: number;
  selectorChangedCount: number;
};

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function evaluateShadowRanking(
  baseline: ShadowBaselineCandidate[],
  hybrid: ShadowHybridCandidate[],
  limit: number,
): ShadowRankingEvaluation {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const baselineTop = baseline.slice(0, safeLimit);
  const hybridTop = hybrid.slice(0, safeLimit);
  const baselineTopIds = new Set(baselineTop.map((candidate) => candidate.id));
  const overlap = hybridTop.filter((candidate) => baselineTopIds.has(candidate.id)).length;
  const baselineRanks = new Map(baseline.map((candidate, index) => [candidate.id, index + 1]));
  const displacement = hybrid.reduce((sum, candidate) =>
    sum + Math.abs((baselineRanks.get(candidate.id) ?? candidate.selectedRank) - candidate.selectedRank), 0);
  const seenArtists = new Set<string>();
  let repeatedArtists = 0;
  for (const candidate of hybridTop) {
    if (seenArtists.has(candidate.artist)) repeatedArtists += 1;
    seenArtists.add(candidate.artist);
  }
  const comparedPositions = Math.min(baselineTop.length, hybridTop.length);
  let selectorChangedCount = 0;
  for (let index = 0; index < comparedPositions; index += 1) {
    if (baselineTop[index]?.id !== hybridTop[index]?.id) selectorChangedCount += 1;
  }

  return {
    audioCoverageRatio: ratio(hybrid.filter((candidate) => candidate.audioAvailable).length, hybrid.length),
    candidateCount: hybrid.length,
    fallbackUsed: hybrid.some((candidate) => candidate.fallbackUsed),
    hybridTrackIds: hybridTop.map((candidate) => candidate.id),
    meanAbsoluteRankDisplacement: ratio(displacement, hybrid.length),
    moodCoverageRatio: ratio(hybrid.filter((candidate) => candidate.moodAvailable).length, hybrid.length),
    overlapAtK: ratio(overlap, Math.max(baselineTop.length, hybridTop.length)),
    rhythmCoverageRatio: ratio(hybrid.filter((candidate) => candidate.rhythmAvailable).length, hybrid.length),
    sameArtistRatio: ratio(repeatedArtists, hybridTop.length),
    selectorChangedCount,
  };
}
