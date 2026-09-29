import { MusicDashboard } from "@/components/dashboard/music-dashboard";
import { after } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { getUserConnection } from "@/lib/db/user-connections";
import {
  recordRecommendationShadow,
  type PersonalizedRecommendations,
} from "@/lib/db/gms-recommendations";
import {
  getOrCreatePersonalizedRecommendationBatch,
  listPersonalizedRecommendationHistory,
  type RecommendationHistoryEntry,
} from "@/lib/db/gms-recommendation-batches";

export default async function GmsPage() {
  const session = await auth0.getSession();
  let connectionStatus: ConnectionStatus = "not_connected";

  if (session && process.env.DATABASE_URL) {
    connectionStatus =
      (await getUserConnection(session.user.sub))?.status ?? "not_connected";
  }

  let recommendations = {
    profileReady: false,
    profileVersion: "ems-v1",
    rankingVersion: "baseline",
    tracks: [],
  } as PersonalizedRecommendations;
  let batchId: string | null = null;
  let exhausted = false;
  let history: RecommendationHistoryEntry[] = [];
  let recommendationError = false;
  if (session && connectionStatus === "connected" && process.env.DATABASE_URL) {
    try {
      const [batch, recommendationHistory] = await Promise.all([
        getOrCreatePersonalizedRecommendationBatch(session.user.sub, 12),
        listPersonalizedRecommendationHistory(session.user.sub, 10).catch(() => []),
      ]);
      recommendations = batch.recommendations;
      batchId = batch.batchId;
      exhausted = batch.exhausted;
      history = recommendationHistory;
      if (batch.shadow && batch.serving) {
        after(async () => {
          await recordRecommendationShadow(
            session.user.sub,
            batch.shadow!,
            batch.serving!,
          ).catch(() => undefined);
        });
      }
    } catch {
      recommendationError = true;
    }
  }

  return (
    <MusicDashboard
      access={{ connectionStatus, isAuthenticated: Boolean(session) }}
      space="gms"
      recommendationError={recommendationError}
      recommendationReady={recommendations.profileReady}
      recommendationBatchId={batchId}
      recommendationExhausted={exhausted}
      recommendationHistory={history}
      profileVersion={recommendations.profileVersion ?? "ems-v1"}
      tracks={recommendations.tracks}
    />
  );
}
