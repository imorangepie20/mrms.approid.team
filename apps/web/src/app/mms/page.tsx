import { MusicDashboard } from "@/components/dashboard/music-dashboard";
import { auth0 } from "@/lib/auth/auth0";
import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { getSavedPlaylists, getSavedTracks } from "@/lib/db/music-library";
import { getUserConnection } from "@/lib/db/user-connections";

export default async function MmsPage() {
  const session = await auth0.getSession();
  let connectionStatus: ConnectionStatus = "not_connected";
  let playlists: Awaited<ReturnType<typeof getSavedPlaylists>> = [];
  let tracks: Awaited<ReturnType<typeof getSavedTracks>> = [];

  if (session && process.env.DATABASE_URL) {
    const [connection, savedPlaylists, savedTracks] = await Promise.all([
      getUserConnection(session.user.sub),
      getSavedPlaylists(session.user.sub),
      getSavedTracks(session.user.sub),
    ]);
    connectionStatus = connection?.status ?? "not_connected";
    playlists = savedPlaylists;
    tracks = savedTracks;
  }

  return (
    <MusicDashboard
      access={{ connectionStatus, isAuthenticated: Boolean(session) }}
      playlists={playlists.map((playlist) => ({
        artworkUrl: playlist.tidalArtworkUrl,
        id: playlist.id,
        name: playlist.name,
      }))}
      space="mms"
      tracks={tracks}
    />
  );
}
