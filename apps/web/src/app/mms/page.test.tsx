import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSavedTracks: vi.fn(),
  getSavedPlaylists: vi.fn(),
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
  getSavedPlaylists: mocks.getSavedPlaylists,
  getSavedTracks: mocks.getSavedTracks,
}));
vi.mock("@/lib/db/user-connections", () => ({
  getUserConnection: mocks.getUserConnection,
}));

import MmsPage from "./page";

it("passes the authenticated user's saved tracks to MMS", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test";
  const tracks = [{ id: "saved-track", title: "Saved song" }];
  mocks.getSession.mockResolvedValue({ user: { sub: "auth0|listener-a" } });
  mocks.getUserConnection.mockResolvedValue({ status: "disconnected" });
  mocks.getSavedPlaylists.mockResolvedValue([]);
  mocks.getSavedTracks.mockResolvedValue(tracks);

  const result = await MmsPage();
  result.type(result.props);

  expect(mocks.getSavedTracks).toHaveBeenCalledWith("auth0|listener-a");
  expect(mocks.musicDashboard).toHaveBeenCalledWith(
    expect.objectContaining({
      access: { connectionStatus: "disconnected", isAuthenticated: true },
      tracks,
    }),
  );

  process.env.DATABASE_URL = previousDatabaseUrl;
});
