import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  prepare: vi.fn(),
  recordShadow: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));
vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/db/gms-recommendations", () => ({
  preparePersonalizedEmsRecommendations: mocks.prepare,
  recordRecommendationShadow: mocks.recordShadow,
}));

import { GET } from "./route";

describe("GET /api/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.after.mockImplementation((callback: () => unknown) => {
      mocks.afterCallbacks.push(callback);
    });
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.prepare.mockResolvedValue({
      recommendations: { profileReady: true, profileVersion: "ems-v1", tracks: [] },
      shadow: { rankingVersion: "hybrid-v0" },
    });
    mocks.recordShadow.mockResolvedValue(undefined);
  });

  it("returns scoped recommendations for the authenticated user", async () => {
    const response = await GET(new Request("http://music.test/api/recommendations?limit=8"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profileReady: true,
      profileVersion: "ems-v1",
      tracks: [],
    });
    expect(mocks.prepare).toHaveBeenCalledWith("auth0|listener", 8);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.afterCallbacks[0]?.();
    expect(mocks.recordShadow).toHaveBeenCalledWith(
      "auth0|listener",
      { rankingVersion: "hybrid-v0" },
    );
  });

  it("keeps a shadow write failure outside the recommendation response", async () => {
    mocks.recordShadow.mockRejectedValue(new Error("shadow unavailable"));

    const response = await GET(new Request("http://music.test/api/recommendations"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profileReady: true,
      profileVersion: "ems-v1",
      tracks: [],
    });
    await expect(mocks.afterCallbacks[0]?.()).resolves.toBeUndefined();
  });

  it("does not schedule a shadow write without candidates", async () => {
    mocks.prepare.mockResolvedValue({
      recommendations: { profileReady: true, profileVersion: "ems-v1", tracks: [] },
      shadow: null,
    });

    const response = await GET(new Request("http://music.test/api/recommendations"));

    expect(response.status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns 401 without an authenticated subject", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await GET(new Request("http://music.test/api/recommendations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range limit", async () => {
    const response = await GET(new Request("http://music.test/api/recommendations?limit=25"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid_limit" });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
});
