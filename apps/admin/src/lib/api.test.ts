import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApiError, getAudioAnalysis, getAudioAnalysisTrack, getEmsSummary, getEmsTracks, requeueAudioAnalysisTrack } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("admin API client", () => {
  it("requests summary from the same origin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ activeTrackCount: 12 })));

    await expect(getEmsSummary()).resolves.toEqual({ activeTrackCount: 12 });
    expect(fetch).toHaveBeenCalledWith("/api/admin/ems/summary", expect.objectContaining({ headers: { accept: "application/json" } }));
  });

  it("preserves the server error code for UI state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "admin_forbidden" }), { status: 403 })));

    await expect(getEmsTracks({ query: "track" })).rejects.toEqual(new AdminApiError(403, "admin_forbidden"));
  });

  it("uses bounded same-origin audio analysis endpoints without provider inputs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ tracks: { items: [] } }))
      .mockResolvedValueOnce(Response.json({ id: "track-id" }))
      .mockResolvedValueOnce(Response.json({ trackId: "track-id", status: "pending" }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await getAudioAnalysis({ query: "tone", status: "completed", page: 2, limit: 20 });
    await getAudioAnalysisTrack("track-id");
    await requeueAudioAnalysisTrack("track-id", "essentia-dsp-v1");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/audio-analysis?q=tone&status=completed&page=2&limit=20");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/audio-analysis/track-id");
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/admin/audio-analysis/track-id",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ featureVersion: "essentia-dsp-v1" }) }),
    ]);
  });
});
