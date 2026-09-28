import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, getData, getPool } = vi.hoisted(() => ({ requireAdmin: vi.fn(), getData: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/audio-analysis/admin", async (importOriginal) => ({ ...(await importOriginal()), getAudioAnalysisAdminData: getData }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  getData.mockResolvedValue({ coverage: { activeTrackCount: 1 }, tracks: { items: [] } });
});

describe("GET /api/admin/audio-analysis", () => {
  it("passes bounded filters to the repository after admin authentication", async () => {
    const response = await GET(new Request("https://mrms.approid.team/api/admin/audio-analysis?q=track&status=completed&page=2&limit=10"));
    expect(response.status).toBe(200);
    expect(getData).toHaveBeenCalledWith({ query: "track", status: "completed", page: 2, limit: 10 }, expect.anything());
  });

  it("rejects invalid status and page size", async () => {
    const response = await GET(new Request("https://mrms.approid.team/api/admin/audio-analysis?status=unknown&limit=51"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid_audio_analysis_filter" });
    expect(getData).not.toHaveBeenCalled();
  });

  it("does not query when the admin guard fails", async () => {
    requireAdmin.mockRejectedValue({ status: 403, code: "admin_forbidden" });
    const response = await GET(new Request("https://mrms.approid.team/api/admin/audio-analysis"));
    expect(response.status).toBe(403);
    expect(getData).not.toHaveBeenCalled();
  });
});
