export type FilterableRankingCandidate = {
  id: string;
  isActive: boolean;
  isPlayable: boolean;
};

export function filterRankingCandidates<T extends FilterableRankingCandidate>(
  candidates: T[],
  rejectedIds: ReadonlySet<string>,
): T[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (
      !candidate.isActive
      || !candidate.isPlayable
      || rejectedIds.has(candidate.id)
      || seen.has(candidate.id)
    ) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}
