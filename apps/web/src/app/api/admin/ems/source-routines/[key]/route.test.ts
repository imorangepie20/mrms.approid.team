import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, updateRoutine, getPool } = vi.hoisted(() => ({ requireAdmin: vi.fn(), updateRoutine: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/ems/source-routines", async (importOriginal) => ({ ...(await importOriginal()), updateEmsSourceRoutine: updateRoutine }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { PATCH } from "./route";

function patch(key: string, action: string) {
  const request = new Request(`https://mrms.approid.team/api/admin/ems/source-routines/${key}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
  });
  return PATCH(request, { params: Promise.resolve({ key }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  updateRoutine.mockImplementation(async (key: string) => ({ key }));
});

describe("PATCH /api/admin/ems/source-routines/[key]", () => {
  it.each([
    ["lastfm_artist_tags", "disable"], ["lastfm_artist_tags", "check_now"],
    ["music_attributes", "enable"], ["music_attributes", "check_now"], ["melon_genres", "disable"],
  ])("accepts %s %s", async (key, action) => {
    const response = await patch(key, action);
    expect(response.status).toBe(200);
    expect(updateRoutine).toHaveBeenCalledWith(key, action, expect.anything());
  });

  it("rejects unknown keys", async () => {
    const response = await patch("unknown_source", "enable");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid_ems_source_key" });
    expect(updateRoutine).not.toHaveBeenCalled();
  });
});
