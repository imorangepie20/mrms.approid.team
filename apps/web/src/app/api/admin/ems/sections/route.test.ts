import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, listSections, getPool } = vi.hoisted(() => ({ requireAdmin: vi.fn(), listSections: vi.fn(), getPool: vi.fn() }));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/ems/admin", () => ({ listEmsAdminSections: listSections }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  listSections.mockResolvedValue([{ id: "section-1", slug: "new-releases", title: "신곡 퍼레이드", description: "새 음악", sortOrder: 0, active: true, trackCount: 12, updatedAt: "2026-09-23T00:00:00.000Z" }]);
});

describe("GET /api/admin/ems/sections", () => {
  it("returns section metadata for an admin", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toHaveLength(1);
    expect(response.status).toBe(200);
  });
});
