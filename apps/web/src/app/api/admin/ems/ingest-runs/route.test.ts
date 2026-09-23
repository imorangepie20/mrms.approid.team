import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, listRuns, getPool } = vi.hoisted(() => ({ requireAdmin: vi.fn(), listRuns: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/ems/admin", () => ({ listEmsIngestRuns: listRuns }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  listRuns.mockResolvedValue([{ id: "run-1", runType: "tidal_resolve", status: "completed", requestedCount: 12, matchedCount: 10, errorCode: null, createdAt: "2026-09-23T00:00:00.000Z" }]);
});

describe("GET /api/admin/ems/ingest-runs", () => {
  it("returns bounded ingest history", async () => {
    const response = await GET(new Request("https://mrms.approid.team/api/admin/ems/ingest-runs?page=1&limit=20"));
    await expect(response.json()).resolves.toHaveLength(1);
    expect(listRuns).toHaveBeenCalledWith({ page: 1, limit: 20 }, expect.anything());
  });
});
