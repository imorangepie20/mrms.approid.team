import { MusicDashboard } from "@/components/dashboard/music-dashboard";
import { after } from "next/server";
import { auth0 } from "@/lib/auth/auth0";
import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { getUserConnection } from "@/lib/db/user-connections";
import {
  preparePersonalizedEmsRecommendations,
  recordRecommendationShadow,
  selectPreparedPersonalizedRecommendations,
  type PersonalizedRecommendations,
} from "@/lib/db/gms-recommendations";

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
  let recommendationError = false;
  if (session && connectionStatus === "connected" && process.env.DATABASE_URL) {
    try {
      const prepared = await preparePersonalizedEmsRecommendations(session.user.sub, 12);
      const selected = selectPreparedPersonalizedRecommendations(session.user.sub, prepared);
      recommendations = selected.recommendations;
      const shadow = prepared.shadow;
      if (shadow) {
        after(async () => {
          await recordRecommendationShadow(
            session.user.sub,
            shadow,
            selected.serving,
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
      profileVersion={recommendations.profileVersion ?? "ems-v1"}
      tracks={recommendations.tracks}
    />
  );
}
