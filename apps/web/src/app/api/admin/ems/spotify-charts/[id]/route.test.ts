import { beforeEach, describe, expect, it, vi } from "vitest";

const { changeRun, getPool, requireAdmin } = vi.hoisted(() => ({
  changeRun: vi.fn(),
  getPool: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/admin", async (importOriginal) => ({
  ...(await importOriginal()),
  requireAdminAuth0Subject: requireAdmin,
}));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));
vi.mock("@/lib/ems/spotify-charts", () => ({ changeSpotifyChartRun: changeRun }));

import { PATCH } from "./route";

const context = {
  params: Promise.resolve({ id: "12345678-1234-1234-1234-123456789abc" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  changeRun.mockResolvedValue({
    run_id: "12345678-1234-1234-1234-123456789abc",
    status: "paused",
  });
});

describe("PATCH /api/admin/ems/spotify-charts/:id", () => {
  it("pauses a run from the same origin", async () => {
    const response = await PATCH(new Request(
      "https://mrms.approid.team/api/admin/ems/spotify-charts/12345678-1234-1234-1234-123456789abc",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://mrms.approid.team" },
        body: JSON.stringify({ action: "pause" }),
      },
    ), context);

    expect(response.status).toBe(200);
    expect(changeRun).toHaveBeenCalledWith(
      expect.anything(),
      "12345678-1234-1234-1234-123456789abc",
      "pause",
    );
  });

  it("rejects unsupported transitions before touching the database", async () => {
    const response = await PATCH(new Request(
      "https://mrms.approid.team/api/admin/ems/spotify-charts/12345678-1234-1234-1234-123456789abc",
      {
        method: "PATCH",
        headers: { "content-type": "application/json", origin: "https://mrms.approid.team" },
        body: JSON.stringify({ action: "delete" }),
      },
    ), context);

    expect(response.status).toBe(400);
    expect(changeRun).not.toHaveBeenCalled();
  });
});
