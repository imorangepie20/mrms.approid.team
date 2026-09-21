import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupArtist, lookupIsrc } from "./client";

afterEach(() => {
  delete process.env.MUSICBRAINZ_USER_AGENT;
});

describe("MusicBrainz client", () => {
  it("looks up an encoded ISRC with artist credits and an identifying user agent", async () => {
    process.env.MUSICBRAINZ_USER_AGENT = "music-pie/0.1.0 (https://mrms.approid.team)";
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ recordings: [] }),
    );

    await lookupIsrc("US ABC/23", fetcher);

    const [request, options] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(request.pathname).toBe("/ws/2/isrc/US%20ABC%2F23");
    expect(request.searchParams.get("inc")).toBe("artist-credits+releases");
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

  it("looks up an artist with genres and tags kept in vote order", async () => {
    process.env.MUSICBRAINZ_USER_AGENT = "music-pie/0.1.0";
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        genres: [
          { count: 9, name: "jazz" },
          { count: 2, name: "bebop" },
        ],
        name: "Oscar Peterson",
        tags: [
          { count: 4, name: "piano jazz" },
          { count: 1, name: "canadian" },
        ],
      }),
    );

    const artist = await lookupArtist(
      "ed801bdd-f057-41c0-94fb-76cb5676cd59",
      fetcher,
    );

    const [request] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(request.pathname).toBe(
      "/ws/2/artist/ed801bdd-f057-41c0-94fb-76cb5676cd59",
    );
    expect(request.searchParams.get("inc")).toBe("genres+tags");
    expect(artist).toEqual({
      genres: [
        { count: 9, name: "jazz" },
        { count: 2, name: "bebop" },
      ],
      name: "Oscar Peterson",
      tags: [
        { count: 4, name: "piano jazz" },
        { count: 1, name: "canadian" },
      ],
    });
  });

  it("treats an artist response without a name as invalid", async () => {
    process.env.MUSICBRAINZ_USER_AGENT = "music-pie/0.1.0";
    const fetcher = vi.fn().mockResolvedValue(Response.json({ genres: [] }));

    await expect(
      lookupArtist("ed801bdd-f057-41c0-94fb-76cb5676cd59", fetcher),
    ).rejects.toEqual(
      expect.objectContaining({
        kind: "invalid_response",
        message: "invalid_response",
      }),
    );
  });
});
