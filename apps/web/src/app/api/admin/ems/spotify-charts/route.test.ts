import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRun, getPool, listRuns, requireAdmin } = vi.hoisted(() => ({
  createRun: vi.fn(),
  getPool: vi.fn(),
  listRuns: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/admin", async (importOriginal) => ({
  ...(await importOriginal()),
  requireAdminAuth0Subject: requireAdmin,
}));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));
vi.mock("@/lib/ems/spotify-charts", async (importOriginal) => ({
  ...(await importOriginal()),
  createSpotifyChartRun: createRun,
  listSpotifyChartRuns: listRuns,
}));

import { GET, POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  listRuns.mockResolvedValue([]);
  createRun.mockResolvedValue("12345678-1234-1234-1234-123456789abc");
});

describe("/api/admin/ems/spotify-charts", () => {
  it("returns the fixed budgets and run history to an admin", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.limits).toEqual({
      playlists: 4,
      tracksPerPlaylist: 50,
      spotifyRequests: 4,
      tidalRequests: 450,
    });
    expect(body.targets).toHaveLength(4);
    expect(listRuns).toHaveBeenCalledWith(expect.anything());
  });

  it("creates a bounded run from the same origin", async () => {
    const response = await POST(new Request(
      "https://mrms.approid.team/api/admin/ems/spotify-charts",
      { method: "POST", headers: { origin: "https://mrms.approid.team" } },
    ));

    expect(response.status).toBe(201);
    expect(createRun).toHaveBeenCalledWith(expect.anything(), "auth0|admin");
  });

  it("rejects cross-origin writes", async () => {
    const response = await POST(new Request(
      "https://mrms.approid.team/api/admin/ems/spotify-charts",
      { method: "POST", headers: { origin: "https://example.com" } },
    ));

    expect(response.status).toBe(403);
    expect(createRun).not.toHaveBeenCalled();
  });
});
