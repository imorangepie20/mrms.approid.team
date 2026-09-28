import { MusicDashboard } from "@/components/dashboard/music-dashboard";
import { auth0 } from "@/lib/auth/auth0";
import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { getMmsPlaylists } from "@/lib/db/mms-playlists";
import { getSavedPlaylists, getSavedPlaylistTracks } from "@/lib/db/music-library";
import type { MmsPlaylistSummary } from "@/lib/mms/playlists";
import { getUserConnection } from "@/lib/db/user-connections";

export default async function MmsPage() {
  const session = await auth0.getSession();
  let connectionStatus: ConnectionStatus = "not_connected";
  let mmsPlaylists: MmsPlaylistSummary[] = [];
  let importedPlaylists: Array<{
    artworkUrl: string | null;
    id: string;
    name: string;
    tidalPlaylistId: string;
    tracks: Awaited<ReturnType<typeof getSavedPlaylistTracks>>[number]["track"][];
  }> = [];

  if (session && process.env.DATABASE_URL) {
    const [connection, playlists, playlistTracks, internalPlaylists] = await Promise.all([
      getUserConnection(session.user.sub),
      getSavedPlaylists(session.user.sub),
      getSavedPlaylistTracks(session.user.sub),
      getMmsPlaylists(session.user.sub),
    ]);
    connectionStatus = connection?.status ?? "not_connected";
    mmsPlaylists = internalPlaylists;
    const tracksByPlaylist = new Map<string, typeof playlistTracks>();
    for (const positionedTrack of playlistTracks) {
      const current = tracksByPlaylist.get(positionedTrack.playlistId) ?? [];
      current.push(positionedTrack);
      tracksByPlaylist.set(positionedTrack.playlistId, current);
    }
    importedPlaylists = playlists.map((playlist) => ({
      artworkUrl: playlist.tidalArtworkUrl,
      id: playlist.id,
      name: playlist.name,
      tidalPlaylistId: playlist.tidalPlaylistId,
      tracks: (tracksByPlaylist.get(playlist.id) ?? []).map(({ track }) => track),
    }));
  }

  return (
    <MusicDashboard
      access={{ connectionStatus, isAuthenticated: Boolean(session) }}
      importedPlaylists={importedPlaylists}
      mmsPlaylists={mmsPlaylists}
      space="mms"
    />
  );
}
