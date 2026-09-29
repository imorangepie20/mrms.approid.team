import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  recordShadow: vi.fn(),
  requireSubject: vi.fn(),
  rotate: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/gms-recommendation-batches", () => ({
  rotatePersonalizedRecommendationBatch: mocks.rotate,
}));
vi.mock("@/lib/db/gms-recommendations", () => ({
  recordRecommendationShadow: mocks.recordShadow,
}));

import { POST } from "./route";

const batchId = "f17870e2-b297-4451-adf5-9856f257b720";

function request(body: unknown) {
  return new Request("http://music.test/api/recommendations/refresh", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/recommendations/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.after.mockImplementation((callback: () => unknown) => mocks.afterCallbacks.push(callback));
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.rotate.mockResolvedValue({
      batchId: "8acb99e4-78ba-410c-aefd-e1638be9fbb8",
      createdAt: "2026-09-29T01:00:00.000Z",
      exhausted: false,
      recommendations: {
        profileReady: true,
        profileVersion: "ems-v1",
        rankingVersion: "hybrid-v0",
        tracks: [{ id: "track-b" }],
      },
      serving: null,
      shadow: null,
    });
  });

  it("replaces the expected current batch for the authenticated user", async () => {
    const response = await POST(request({ currentBatchId: batchId }));

    expect(response.status).toBe(200);
    expect(mocks.rotate).toHaveBeenCalledWith("auth0|listener", batchId, 12);
    await expect(response.json()).resolves.toMatchObject({
      batchId: "8acb99e4-78ba-410c-aefd-e1638be9fbb8",
      exhausted: false,
      recommendations: { tracks: [{ id: "track-b" }] },
    });
  });

  it("rejects malformed batch ids before reading recommendation state", async () => {
    const response = await POST(request({ currentBatchId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(mocks.rotate).not.toHaveBeenCalled();
  });

  it("returns 401 without an authenticated subject", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await POST(request({ currentBatchId: batchId }));

    expect(response.status).toBe(401);
    expect(mocks.rotate).not.toHaveBeenCalled();
  });
});
