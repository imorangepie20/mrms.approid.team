import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, listTracks, getPool } = vi.hoisted(() => ({ requireAdmin: vi.fn(), listTracks: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/ems/admin", () => ({ listEmsAdminTracks: listTracks }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  listTracks.mockResolvedValue({ totalCount: 1, page: 1, limit: 24, nextPage: null, tracks: [] });
});

describe("GET /api/admin/ems/tracks", () => {
  it("passes bounded search filters to the repository", async () => {
    const response = await GET(new Request("https://mrms.approid.team/api/admin/ems/tracks?q=track&page=1&limit=24&embeddingStatus=pending"));
    await expect(response.json()).resolves.toMatchObject({ totalCount: 1 });
    expect(listTracks).toHaveBeenCalledWith(expect.objectContaining({ query: "track", page: 1, limit: 24, embeddingStatus: "pending" }), expect.anything());
  });

  it("rejects an out-of-range page size", async () => {
    const response = await GET(new Request("https://mrms.approid.team/api/admin/ems/tracks?limit=101"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid_admin_track_filter" });
    expect(listTracks).not.toHaveBeenCalled();
  });
});
