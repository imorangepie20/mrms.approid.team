import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, getSummary, getPool } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSummary: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/ems/admin", () => ({ getEmsAdminSummary: getSummary }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { GET } from "./route";

beforeEach(() => {
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  getSummary.mockResolvedValue({ activeTrackCount: 12, activeSectionCount: 4, artworkMissingCount: 2, embeddingCounts: { completed: 10 }, latestIngest: null });
});

describe("GET /api/admin/ems/summary", () => {
  it("returns the EMS summary for an admin", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ activeTrackCount: 12 });
    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledOnce();
  });

  it("returns the guard error without querying the database", async () => {
    getSummary.mockClear();
    requireAdmin.mockRejectedValue({ status: 403, code: "admin_forbidden" });

    const response = await GET();
    await expect(response.json()).resolves.toEqual({ code: "admin_forbidden" });
    expect(response.status).toBe(403);
    expect(getSummary).not.toHaveBeenCalled();
  });
});
