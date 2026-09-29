import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshTasteProfile: vi.fn(),
  requireSubject: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/db/gms-recommendations", () => ({
  saveRecommendationDecision: mocks.save,
}));
vi.mock("@/lib/embeddings/jobs", () => ({
  refreshTasteProfileFromActions: mocks.refreshTasteProfile,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://music.test/api/recommendations/decisions", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/recommendations/decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.refreshTasteProfile.mockResolvedValue(undefined);
    mocks.save.mockResolvedValue(undefined);
  });

  it("records a valid user decision", async () => {
    const body = {
      decision: "reject",
      profileVersion: "ems-v1",
      rankingVersion: "baseline",
      reasonCodes: ["low_similarity"],
      scoreComponents: { similarity: 0.2 },
      sourceTrackId: "track-a",
    };

    const response = await POST(request(body));

    expect(response.status).toBe(204);
    expect(mocks.save).toHaveBeenCalledWith("auth0|listener", body);
  });

  it("rejects anonymous and malformed decisions", async () => {
    mocks.requireSubject.mockRejectedValueOnce(new Error("unauthorized"));
    const anonymous = await POST(request({}));
    expect(anonymous.status).toBe(401);

    const malformed = await POST(request({ decision: "later" }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ code: "invalid_decision" });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("normalizes a legacy decision without ranking version to baseline", async () => {
    const body = {
      decision: "skip",
      profileVersion: "ems-v1",
      reasonCodes: ["taste_match"],
      scoreComponents: { similarity: 0.7 },
      sourceTrackId: "track-a",
    };

    const response = await POST(request(body));

    expect(response.status).toBe(204);
    expect(mocks.save).toHaveBeenCalledWith("auth0|listener", {
      ...body,
      rankingVersion: "baseline",
    });
    expect(mocks.refreshTasteProfile).not.toHaveBeenCalled();
  });

  it("rejects an unknown ranking version", async () => {
    const response = await POST(request({
      decision: "reject",
      profileVersion: "ems-v1",
      rankingVersion: "hybrid-v1",
      reasonCodes: [],
      scoreComponents: {},
      sourceTrackId: "track-a",
    }));

    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
