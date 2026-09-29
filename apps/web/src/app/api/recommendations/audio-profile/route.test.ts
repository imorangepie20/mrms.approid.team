import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/db/audio-taste-profiles", () => ({
  refreshAudioTasteProfile: mocks.refresh,
}));

import { POST } from "./route";

describe("POST /api/recommendations/audio-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.refresh.mockResolvedValue({
      analyzedTrackCount: 6,
      coverageRatio: 1,
      created: true,
      eligibleTrackCount: 6,
      profileVersion: "profile-version",
    });
  });

  it("refreshes only the authenticated user's audio profile", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      analyzedTrackCount: 6,
      coverageRatio: 1,
      created: true,
      eligibleTrackCount: 6,
    });
    expect(mocks.refresh).toHaveBeenCalledWith("auth0|listener");
  });

  it("rejects an anonymous request", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not expose internal refresh errors", async () => {
    mocks.refresh.mockRejectedValue(new Error("database detail"));

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "audio_taste_profile_refresh_failed",
    });
  });
});
