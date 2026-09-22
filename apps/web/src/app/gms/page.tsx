import { MusicDashboard } from "@/components/dashboard/music-dashboard";
import { auth0 } from "@/lib/auth/auth0";
import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { getUserConnection } from "@/lib/db/user-connections";
import { listPersonalizedEmsRecommendations } from "@/lib/db/gms-recommendations";

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
    tracks: [],
  } as Awaited<ReturnType<typeof listPersonalizedEmsRecommendations>>;
  let recommendationError = false;
  if (session && connectionStatus === "connected" && process.env.DATABASE_URL) {
    try {
      recommendations = await listPersonalizedEmsRecommendations(session.user.sub, 12);
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
