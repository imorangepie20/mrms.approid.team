import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSavedPlaylistTracks: vi.fn(),
  getSavedPlaylists: vi.fn(),
  getSavedTracks: vi.fn(),
  getMmsPlaylists: vi.fn(),
  getAcceptedRecommendationTracks: vi.fn(),
  getSession: vi.fn(),
  getUserConnection: vi.fn(),
  musicDashboard: vi.fn(() => null),
}));

vi.mock("@/components/dashboard/music-dashboard", () => ({
  MusicDashboard: mocks.musicDashboard,
}));
vi.mock("@/lib/auth/auth0", () => ({
  auth0: { getSession: mocks.getSession },
}));
vi.mock("@/lib/db/music-library", () => ({
  getSavedPlaylistTracks: mocks.getSavedPlaylistTracks,
  getSavedPlaylists: mocks.getSavedPlaylists,
  getSavedTracks: mocks.getSavedTracks,
}));
vi.mock("@/lib/db/mms-playlists", () => ({
  getMmsPlaylists: mocks.getMmsPlaylists,
}));
vi.mock("@/lib/db/gms-recommendations", () => ({
  getAcceptedRecommendationTracks: mocks.getAcceptedRecommendationTracks,
}));
vi.mock("@/lib/db/user-connections", () => ({
  getUserConnection: mocks.getUserConnection,
}));

import MmsPage from "./page";

it("loads imported playlists and their stored tracks without restoring the saved-track box", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test";
  mocks.getSession.mockResolvedValue({ user: { sub: "auth0|listener-a" } });
  mocks.getAcceptedRecommendationTracks.mockResolvedValue([{
    id: "accepted-track", title: "Accepted Song", artist: "Artist", album: "Album",
    artworkUrl: "", artworkClass: "", tidalTrackId: "123",
  }]);
  mocks.getUserConnection.mockResolvedValue({ status: "connected" });
  mocks.getSavedPlaylists.mockResolvedValue([{
    description: null,
    id: "saved-playlist-1",
    lastSyncedAt: null,
    name: "Imported Favorites",
    tidalArtworkUrl: "https://resources.tidal.com/playlist.jpg",
    tidalPlaylistId: "tidal-playlist-1",
  }]);
  mocks.getSavedPlaylistTracks.mockResolvedValue([{
    playlistId: "saved-playlist-1",
    position: 0,
    track: {
      album: "Homogenic",
      artist: "Björk",
      artworkClass: "from-violet-700 to-slate-900",
      artworkUrl: "",
      durationSeconds: 300,
      id: "saved-track-1",
      tidalTrackId: "tidal-track-1",
      title: "Jóga",
    },
  }]);
  mocks.getMmsPlaylists.mockResolvedValue([{
    createdAt: "2026-09-28T00:00:00.000Z",
    description: null,
    id: "mms-playlist-1",
    name: "Night Drive",
    trackCount: 0,
    updatedAt: "2026-09-28T00:00:00.000Z",
  }]);

  const result = await MmsPage();
  result.type(result.props);

  expect(mocks.getUserConnection).toHaveBeenCalledWith("auth0|listener-a");
  expect(mocks.getSavedTracks).not.toHaveBeenCalled();
  expect(mocks.getSavedPlaylists).toHaveBeenCalledWith("auth0|listener-a");
  expect(mocks.getSavedPlaylistTracks).toHaveBeenCalledWith("auth0|listener-a");
  expect(mocks.getMmsPlaylists).toHaveBeenCalledWith("auth0|listener-a");
  expect(mocks.getAcceptedRecommendationTracks).toHaveBeenCalledWith("auth0|listener-a");
  expect(mocks.musicDashboard).toHaveBeenCalledWith(expect.objectContaining({
    access: { connectionStatus: "connected", isAuthenticated: true },
    importedPlaylists: [{
      artworkUrl: "https://resources.tidal.com/playlist.jpg",
      id: "saved-playlist-1",
      name: "Imported Favorites",
      tidalPlaylistId: "tidal-playlist-1",
      tracks: [expect.objectContaining({ id: "saved-track-1", title: "Jóga" })],
    }],
    mmsPlaylists: [expect.objectContaining({ id: "mms-playlist-1", name: "Night Drive" })],
    space: "mms",
    acceptedRecommendationTracks: [expect.objectContaining({ id: "accepted-track" })],
  }));

  process.env.DATABASE_URL = previousDatabaseUrl;
});
