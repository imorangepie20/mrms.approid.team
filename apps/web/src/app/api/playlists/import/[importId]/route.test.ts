import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getImport: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/playlists/import-playlists", () => ({
  getPlaylistImport: mocks.getImport,
}));

import { GET } from "./route";

describe("GET /api/playlists/import/[importId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
  });

  it("returns 404 when the import is not owned by the authenticated user", async () => {
    mocks.getImport.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ importId: "someone-elses-import" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.getImport).toHaveBeenCalledWith(
      "auth0|listener",
      "someone-elses-import",
    );
  });

  it("returns the authenticated user's import status", async () => {
    mocks.getImport.mockResolvedValue({ id: "import-1", status: "running" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ importId: "import-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "import-1", status: "running" });
  });
});
