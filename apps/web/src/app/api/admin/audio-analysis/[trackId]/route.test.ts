import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, getDetail, requeue, getPool } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), getDetail: vi.fn(), requeue: vi.fn(), getPool: vi.fn(),
}));
vi.mock("@/lib/auth/admin", async (importOriginal) => ({ ...(await importOriginal()), requireAdminAuth0Subject: requireAdmin }));
vi.mock("@/lib/audio-analysis/admin", async (importOriginal) => ({
  ...(await importOriginal()), getAudioAnalysisTrackDetail: getDetail, requeueAudioAnalysisTrack: requeue,
}));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: getPool }));

import { GET, POST } from "./route";

const trackId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ trackId }) };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue("auth0|admin");
  getPool.mockReturnValue({ query: vi.fn() });
  getDetail.mockResolvedValue({ id: trackId, status: "completed" });
  requeue.mockResolvedValue({ trackId, status: "pending", featureVersion: "essentia-dsp-v1" });
});

describe("/api/admin/audio-analysis/[trackId]", () => {
  it("returns one admin-safe track detail", async () => {
    const response = await GET(new Request(`https://mrms.approid.team/api/admin/audio-analysis/${trackId}`), context);
    expect(response.status).toBe(200);
    expect(getDetail).toHaveBeenCalledWith(trackId, expect.anything());
  });

  it("requires the exact bounded requeue body", async () => {
    const response = await POST(new Request(`https://mrms.approid.team/api/admin/audio-analysis/${trackId}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mrms.approid.team" },
      body: JSON.stringify({ featureVersion: "essentia-dsp-v1" }),
    }), context);
    expect(response.status).toBe(202);
    expect(requeue).toHaveBeenCalledWith(trackId, "essentia-dsp-v1", expect.anything());
  });

  it("rejects invalid ids, versions, extra batch fields, and cross-origin writes", async () => {
    const invalidId = await GET(new Request("https://mrms.approid.team/api/admin/audio-analysis/not-a-uuid"), { params: Promise.resolve({ trackId: "not-a-uuid" }) });
    expect(invalidId.status).toBe(400);

    const invalidBody = await POST(new Request(`https://mrms.approid.team/api/admin/audio-analysis/${trackId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ featureVersion: "essentia-dsp-v1", batchSize: 100 }),
    }), context);
    expect(invalidBody.status).toBe(400);

    const invalidOrigin = await POST(new Request(`https://mrms.approid.team/api/admin/audio-analysis/${trackId}`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://example.com" }, body: JSON.stringify({ featureVersion: "essentia-dsp-v1" }),
    }), context);
    expect(invalidOrigin.status).toBe(403);
    expect(requeue).not.toHaveBeenCalled();
  });

  it("returns conflict instead of resetting a running job", async () => {
    requeue.mockRejectedValue(new Error("audio_analysis_track_busy"));
    const response = await POST(new Request(`https://mrms.approid.team/api/admin/audio-analysis/${trackId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ featureVersion: "essentia-dsp-v1" }),
    }), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code: "audio_analysis_track_busy" });
  });
});
