import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, updateSection, getPool } = vi.hoisted(() => ({ requireAdmin: vi.fn(), updateSection: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/ems/admin", () => ({ updateEmsSection: updateSection }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  updateSection.mockResolvedValue({ id: "section-1", slug: "new-releases", title: "수정", description: "설명", sortOrder: 1, active: false, trackCount: 12, updatedAt: "2026-09-23T00:00:00.000Z" });
});

describe("PATCH /api/admin/ems/sections/:id", () => {
  it("updates only the editable section fields", async () => {
    const response = await PATCH(new Request("https://mrms.approid.team/api/admin/ems/sections/section-1", { method: "PATCH", body: JSON.stringify({ title: "수정", description: "설명", sortOrder: 1, active: false }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: "section-1" }) });
    await expect(response.json()).resolves.toMatchObject({ title: "수정", active: false });
    expect(response.status).toBe(200);
  });

  it("rejects fields outside the patch contract", async () => {
    const response = await PATCH(new Request("https://mrms.approid.team/api/admin/ems/sections/section-1", { method: "PATCH", body: JSON.stringify({ title: "수정", description: "설명", sortOrder: 1, active: true, slug: "changed" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: "section-1" }) });
    await expect(response.json()).resolves.toEqual({ code: "invalid_admin_section_patch" });
    expect(response.status).toBe(400);
    expect(updateSection).not.toHaveBeenCalled();
  });
});
