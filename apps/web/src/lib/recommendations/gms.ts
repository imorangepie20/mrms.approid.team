import type { TransactionExecutor } from "@/lib/db/music-library";

export type EmsScoreInput = {
  similarity: number;
  matchConfidence: number;
  catalogPriority: number;
  freshness: number;
  diversity: number;
};

export type RecommendationDecisionInput = {
  userId: string;
  sourceTrackId: string;
  profileVersion: string;
  decision: "accept" | "reject" | "skip";
  reasonCodes: string[];
  scoreComponents: Record<string, number>;
};

export function calculateEmsScore(input: EmsScoreInput): number {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const confidence = (clamp(input.matchConfidence) + clamp(input.catalogPriority)) / 2;
  return Number((clamp(input.similarity) * 0.65 + confidence * 0.15 + clamp(input.freshness) * 0.1 + clamp(input.diversity) * 0.1).toFixed(6));
}

export function filterPermanentlyRejected<T extends { id: string }>(tracks: T[], rejectedIds: ReadonlySet<string>): T[] {
  return tracks.filter((track) => !rejectedIds.has(track.id));
}

export async function recordRecommendationDecision(executor: TransactionExecutor, input: RecommendationDecisionInput): Promise<void> {
  await executor.query(
    `INSERT INTO user_recommendation_decisions
      (user_id, source_track_id, profile_version, decision, reason_codes, score_components)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [input.userId, input.sourceTrackId, input.profileVersion, input.decision, JSON.stringify(input.reasonCodes), JSON.stringify(input.scoreComponents)],
  );
}
