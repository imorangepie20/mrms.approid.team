import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/db/gms-recommendations", () => ({
  listPersonalizedEmsRecommendations: mocks.list,
}));

import { GET } from "./route";

describe("GET /api/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.list.mockResolvedValue({ profileReady: true, profileVersion: "ems-v1", tracks: [] });
  });

  it("returns scoped recommendations for the authenticated user", async () => {
    const response = await GET(new Request("http://music.test/api/recommendations?limit=8"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profileReady: true,
      profileVersion: "ems-v1",
      tracks: [],
    });
    expect(mocks.list).toHaveBeenCalledWith("auth0|listener", 8);
  });

  it("returns 401 without an authenticated subject", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await GET(new Request("http://music.test/api/recommendations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range limit", async () => {
    const response = await GET(new Request("http://music.test/api/recommendations?limit=25"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid_limit" });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
