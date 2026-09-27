import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchVisualizerAnalysisAudio } from "./use-tidal-audio-analyser";

describe("visualizer analysis audio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the small LOW analysis stream instead of the playback-quality file", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetcher);

    const data = await fetchVisualizerAnalysisAudio("42", new AbortController().signal);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/tidal/tracks/42/analysis?quality=LOW",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(Array.from(new Uint8Array(data))).toEqual([1, 2, 3]);
  });
});
