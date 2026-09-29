const REPEATED_ARTIST_PENALTY = 0.075;

export type HybridSelectionInput = {
  artist: string;
  baseScore: number;
  id: string;
};

export type HybridSelectionResult<T extends HybridSelectionInput = HybridSelectionInput> = T & {
  baseRank: number;
  repeatedArtist: boolean;
  selectedRank: number;
  selectorScore: number;
};

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

export function rankHybridCandidates<T extends HybridSelectionInput>(
  candidates: T[],
): HybridSelectionResult<T>[] {
  const baseOrder = [...candidates].sort((left, right) =>
    right.baseScore - left.baseScore || left.id.localeCompare(right.id)
  );
  const baseRanks = new Map(baseOrder.map((candidate, index) => [candidate.id, index + 1]));
  const remaining = [...candidates];
  const selected: HybridSelectionResult<T>[] = [];

  while (remaining.length > 0) {
    const ranked = remaining.map((candidate) => {
      const repeatedArtist = selected.some((item) => item.artist === candidate.artist);
      return {
        candidate,
        repeatedArtist,
        selectorScore: rounded(Math.max(
          0,
          candidate.baseScore - (repeatedArtist ? REPEATED_ARTIST_PENALTY : 0),
        )),
      };
    });
    ranked.sort((left, right) =>
      right.selectorScore - left.selectorScore
      || left.candidate.id.localeCompare(right.candidate.id)
    );
    const next = ranked[0];
    if (!next) break;
    selected.push({
      ...next.candidate,
      baseRank: baseRanks.get(next.candidate.id) ?? selected.length + 1,
      repeatedArtist: next.repeatedArtist,
      selectedRank: selected.length + 1,
      selectorScore: next.selectorScore,
    });
    remaining.splice(remaining.findIndex((candidate) => candidate.id === next.candidate.id), 1);
  }
  return selected;
}
