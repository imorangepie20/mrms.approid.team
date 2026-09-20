import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnectTidal: vi.fn(),
  requireAuth0Subject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireAuth0Subject,
}));
vi.mock("@/lib/db/music-library", () => ({
  disconnectTidal: mocks.disconnectTidal,
}));

import { POST } from "./route";

describe("POST /api/tidal/disconnect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disconnects the authenticated user and returns retained counts", async () => {
    mocks.requireAuth0Subject.mockResolvedValue("auth0|listener-a");
    mocks.disconnectTidal.mockResolvedValue({
      playlistCount: 3,
      status: "disconnected",
      trackCount: 80,
    });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      playlistCount: 3,
      status: "disconnected",
      trackCount: 80,
    });
    expect(mocks.disconnectTidal).toHaveBeenCalledWith("auth0|listener-a");
  });

  it("rejects anonymous requests", async () => {
    mocks.requireAuth0Subject.mockRejectedValue(new Error("unauthorized"));

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.disconnectTidal).not.toHaveBeenCalled();
  });
});
