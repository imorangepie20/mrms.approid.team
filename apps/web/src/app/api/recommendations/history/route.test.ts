import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hideTrack: vi.fn(),
  hideBatch: vi.fn(),
  revalidate: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/db/gms-recommendation-batches", () => ({
  hidePersonalizedRecommendationHistoryTrack: mocks.hideTrack,
  hidePersonalizedRecommendationHistoryBatch: mocks.hideBatch,
}));

import { DELETE } from "./route";

const batchId = "f17870e2-b297-4451-adf5-9856f257b720";
const trackId = "c2f2103a-b909-498a-8c5c-3aec030b63be";

function request(body: unknown) {
  return new Request("http://music.test/api/recommendations/history", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  });
}

describe("DELETE /api/recommendations/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.hideTrack.mockResolvedValue(true);
    mocks.hideBatch.mockResolvedValue(true);
  });

  it("hides a track from the authenticated user's recommendation history", async () => {
    const response = await DELETE(request({ batchId, trackId }));

    expect(response.status).toBe(204);
    expect(mocks.hideTrack).toHaveBeenCalledWith("auth0|listener", batchId, trackId);
  });

  it("rejects anonymous and malformed requests", async () => {
    mocks.requireSubject.mockRejectedValueOnce(new Error("unauthorized"));
    expect((await DELETE(request({ batchId, trackId }))).status).toBe(401);

    const malformed = await DELETE(request({ batchId: "not-a-uuid", trackId }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ code: "invalid_history_track" });
    expect(mocks.hideTrack).not.toHaveBeenCalled();
  });

  it("does not reveal whether a missing track belongs to another user", async () => {
    mocks.hideTrack.mockResolvedValue(false);

    const response = await DELETE(request({ batchId, trackId }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: "history_track_not_found" });
  });

  it("reports storage failures without removing history client-side", async () => {
    mocks.hideTrack.mockRejectedValue(new Error("database unavailable"));

    const response = await DELETE(request({ batchId, trackId }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: "history_track_removal_unavailable" });
  });


it("removes an owned group in one request and invalidates GMS", async () => {
  expect((await DELETE(request({ batchId }))).status).toBe(204);
  expect(mocks.hideBatch).toHaveBeenCalledWith("auth0|listener", batchId);
  expect(mocks.hideTrack).not.toHaveBeenCalled();
  expect(mocks.revalidate).toHaveBeenCalledWith("/gms");
});
it("checks group ownership and preserves the page after storage failures", async () => {
  mocks.hideBatch.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("offline"));
  expect((await DELETE(request({ batchId }))).status).toBe(404);
  expect((await DELETE(request({ batchId }))).status).toBe(503);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("rejects malformed group IDs and explicit invalid track IDs", async () => {
  for (const body of [{batchId:"invalid"}, {batchId,trackId:null}, {batchId,trackId:12}]) {
    expect((await DELETE(request(body))).status).toBe(400);
  }
  expect(mocks.hideBatch).not.toHaveBeenCalled();
});

});
