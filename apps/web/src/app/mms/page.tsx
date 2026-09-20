import { MusicDashboard } from "@/components/dashboard/music-dashboard";
import { auth0 } from "@/lib/auth/auth0";
import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { getUserConnection } from "@/lib/db/user-connections";

export default async function MmsPage() {
  const session = await auth0.getSession();
  let connectionStatus: ConnectionStatus = "not_connected";

  if (session && process.env.DATABASE_URL) {
    connectionStatus =
      (await getUserConnection(session.user.sub))?.status ?? "not_connected";
  }

  return (
    <MusicDashboard
      access={{ connectionStatus, isAuthenticated: Boolean(session) }}
      space="mms"
    />
  );
}
