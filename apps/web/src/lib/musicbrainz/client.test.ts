import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupIsrc } from "./client";

afterEach(() => {
  delete process.env.MUSICBRAINZ_USER_AGENT;
});

describe("MusicBrainz client", () => {
  it("looks up an encoded ISRC with release relationships and an identifying user agent", async () => {
    process.env.MUSICBRAINZ_USER_AGENT = "music-pie/0.1.0 (https://mrms.approid.team)";
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ recordings: [] }),
    );

    await lookupIsrc("US ABC/23", fetcher);

    const [request, options] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(request.pathname).toBe("/ws/2/isrc/US%20ABC%2F23");
    expect(request.searchParams.get("inc")).toBe(
      "artist-credits+releases+release-groups",
    );
    expect(request.searchParams.get("fmt")).toBe("json");
    expect(options.headers).toEqual({
      "user-agent": "music-pie/0.1.0 (https://mrms.approid.team)",
    });
  });

  it("classifies a 503 response as retryable without exposing its body", async () => {
    process.env.MUSICBRAINZ_USER_AGENT = "music-pie/0.1.0";
    const fetcher = vi.fn().mockResolvedValue(
      new Response("upstream secret body", { status: 503 }),
    );

    await expect(lookupIsrc("USABC2300001", fetcher)).rejects.toEqual(
      expect.objectContaining({ kind: "retryable", message: "retryable" }),
    );
  });
});
