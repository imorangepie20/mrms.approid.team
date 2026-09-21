import { describe, expect, it, vi } from "vitest";

import { MusicBrainzError } from "./client";
import {
  classifyRecordings,
  enrichNextTrack,
  extractArtistMbids,
  type EnrichmentDependencies,
} from "./enrichment";

function recording(id: string, releases: unknown[] = [], artistCredit: unknown[] = []) {
  return { "artist-credit": artistCredit, id, releases };
}

const ARTIST_A = "ed801bdd-f057-41c0-94fb-76cb5676cd59";
const ARTIST_B = "bfaf3f3d-3b8b-4d2c-8f1e-9a0b1c2d3e4f";

describe("MusicBrainz enrichment decisions", () => {
  it.each([
    [[], "not_found"],
    [[recording("a")], "matched"],
    [[recording("a"), recording("b")], "ambiguous"],
  ])("classifies recording candidates as %s", (recordings, status) => {
    expect(classifyRecordings({ recordings }, "Album")).toMatchObject({ status });
  });

  it("returns empty genres and tags when no recording is found", () => {
    expect(classifyRecordings({ recordings: [] }, "Album")).toMatchObject({
      genres: [],
      status: "not_found",
      tags: [],
    });
  });

  it("does not choose a recording when an ISRC has multiple MBIDs", () => {
    expect(
      classifyRecordings(
        { recordings: [recording("a"), recording("b")] },
        "Album",
      ).recordingId,
    ).toBeNull();
  });

  it("selects a release only when one official title matches the TIDAL album", () => {
    const result = classifyRecordings(
      {
        recordings: [
          recording("recording-a", [
            {
              id: "release-a",
              status: "Official",
              title: "Björk – Debut",
              "release-group": { id: "group-a" },
            },
            {
              id: "release-b",
              status: "Bootleg",
              title: "Björk – Debut",
              "release-group": { id: "group-b" },
            },
          ]),
        ],
      },
      "  björk - debut ",
    );

    expect(result).toMatchObject({
      coverArtUrl: "https://coverartarchive.org/release-group/group-a/front-500",
      recordingId: "recording-a",
      releaseGroupId: "group-a",
      releaseId: "release-a",
      status: "matched",
    });
  });

  it("leaves release fields unresolved when multiple official releases match", () => {
    const result = classifyRecordings(
      {
        recordings: [
          recording("recording-a", [
            { id: "release-a", status: "Official", title: "Album" },
            { id: "release-b", status: "Official", title: "Album" },
          ]),
        ],
      },
      "Album",
    );

    expect(result).toMatchObject({
      recordingId: "recording-a",
      releaseGroupId: null,
      releaseId: null,
      status: "matched",
    });
  });

  it("collects artist MBIDs from every recording without duplicates", () => {
    const document = {
      recordings: [
        recording("recording-a", [], [{ artist: { id: ARTIST_A } }]),
        recording("recording-b", [], [
          { artist: { id: ARTIST_B } },
          { artist: { id: ARTIST_A } },
        ]),
      ],
    };

    expect(extractArtistMbids(document)).toEqual([ARTIST_A, ARTIST_B]);
  });

  it("ignores artist credits that carry no MBID", () => {
    expect(
      extractArtistMbids({
        recordings: [
          recording("recording-a", [], [
            { name: "Various Artists", artist: { id: null } },
            { name: "Unknown" },
          ]),
        ],
      }),
    ).toEqual([]);
  });
});

function dependencies(
  overrides: Partial<EnrichmentDependencies> = {},
): EnrichmentDependencies {
  return {
    claimJob: vi.fn().mockResolvedValue({
      albumName: "Album",
      attemptCount: 1,
      isrc: "USABC2300001",
      title: "Track",
      trackId: "track-1",
    }),
    completeJob: vi.fn().mockResolvedValue(undefined),
    countRemaining: vi.fn().mockResolvedValue(2),
    lookup: vi.fn().mockResolvedValue({
      recordings: [
        recording("recording-a", [], [{ artist: { id: ARTIST_A } }]),
      ],
    }),
    lookupArtistGenres: vi.fn().mockResolvedValue({
      genres: ["jazz", "bebop"],
      name: "Oscar Peterson",
      tags: ["piano jazz", "canadian"],
    }),
    lookupCachedArtist: vi.fn().mockResolvedValue(null),
    releaseJob: vi.fn().mockResolvedValue(undefined),
    reserveRequest: vi.fn().mockResolvedValue(true),
    retryJob: vi.fn().mockResolvedValue(undefined),
    slotDelay: vi.fn().mockResolvedValue(0),
    storeArtist: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("MusicBrainz enrichment workflow", () => {
  it("persists one unambiguous result and reports remaining jobs", async () => {
    const deps = dependencies();

    const result = await enrichNextTrack("auth0|listener", deps);

    expect(result).toEqual({ processed: true, remaining: 2 });
    expect(deps.completeJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      expect.objectContaining({ recordingId: "recording-a", status: "matched" }),
    );
  });

  it("fetches artist genres once and stores them in the shared cache", async () => {
    const deps = dependencies();

    await enrichNextTrack("auth0|listener", deps);

    expect(deps.lookupArtistGenres).toHaveBeenCalledWith(ARTIST_A);
    expect(deps.storeArtist).toHaveBeenCalledWith(
      ARTIST_A,
      "Oscar Peterson",
      ["jazz", "bebop"],
      ["piano jazz", "canadian"],
    );
    expect(deps.completeJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      expect.objectContaining({
        genres: ["jazz", "bebop"],
        tags: ["piano jazz", "canadian"],
      }),
    );
  });

  it("uses cached artist genres without a second HTTP request", async () => {
    const deps = dependencies({
      lookupCachedArtist: vi.fn().mockResolvedValue({
        genres: ["jazz"],
        tags: ["piano jazz"],
      }),
    });

    await enrichNextTrack("auth0|listener", deps);

    expect(deps.lookupArtistGenres).not.toHaveBeenCalled();
    expect(deps.storeArtist).not.toHaveBeenCalled();
    expect(deps.completeJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      expect.objectContaining({ genres: ["jazz"], tags: ["piano jazz"] }),
    );
  });

  it("merges genres of co-credited artists without repeating entries", async () => {
    const deps = dependencies({
      lookup: vi.fn().mockResolvedValue({
        recordings: [
          recording(
            "recording-a",
            [],
            [
              { artist: { id: ARTIST_A } },
              { artist: { id: ARTIST_B } },
            ],
          ),
        ],
      }),
      lookupArtistGenres: vi.fn().mockImplementation((mbid: string) =>
        Promise.resolve(
          mbid === ARTIST_A
            ? {
                genres: ["jazz", "bebop"],
                name: "Ben Webster",
                tags: ["saxophone"],
              }
            : {
                genres: ["jazz", "cool jazz"],
                name: "Oscar Peterson",
                tags: ["piano jazz"],
              },
        ),
      ),
    });

    await enrichNextTrack("auth0|listener", deps);

    expect(deps.completeJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      expect.objectContaining({
        genres: ["jazz", "bebop", "cool jazz"],
        tags: ["saxophone", "piano jazz"],
      }),
    );
  });

  it("closes the job with empty genres when the ISRC has no recording", async () => {
    const deps = dependencies({
      lookup: vi.fn().mockResolvedValue({ recordings: [] }),
    });

    await enrichNextTrack("auth0|listener", deps);

    expect(deps.lookupArtistGenres).not.toHaveBeenCalled();
    expect(deps.completeJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      expect.objectContaining({
        genres: [],
        status: "not_found",
        tags: [],
      }),
    );
  });

  it("does not call MusicBrainz when the global request slot is unavailable", async () => {
    const deps = dependencies({ reserveRequest: vi.fn().mockResolvedValue(false) });

    const result = await enrichNextTrack("auth0|listener", deps);

    expect(result).toEqual({ processed: false, remaining: 2 });
    expect(deps.lookup).not.toHaveBeenCalled();
    expect(deps.releaseJob).toHaveBeenCalledWith("auth0|listener", "track-1");
  });

  it("waits for the artist request slot and retries before releasing", async () => {
    const reserve = vi.fn();
    reserve.mockResolvedValueOnce(true);
    reserve.mockResolvedValueOnce(false);
    reserve.mockResolvedValueOnce(false);
    reserve.mockResolvedValueOnce(true);
    const delays = vi.fn().mockResolvedValue(0);
    const deps = dependencies({
      reserveRequest: reserve,
      slotDelay: delays,
    });

    const result = await enrichNextTrack("auth0|listener", deps);

    expect(result).toEqual({ processed: true, remaining: 2 });
    expect(reserve).toHaveBeenCalledTimes(4);
    expect(deps.slotDelay).toHaveBeenCalledTimes(2);
    expect(deps.lookupArtistGenres).toHaveBeenCalledWith(ARTIST_A);
    expect(deps.completeJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      expect.objectContaining({ genres: ["jazz", "bebop"] }),
    );
  });

  it("releases the job when the artist slot stays unavailable", async () => {
    const reserve = vi.fn();
    reserve.mockResolvedValueOnce(true);
    const deps = dependencies({
      reserveRequest: reserve,
      slotDelay: vi.fn().mockResolvedValue(0),
    });

    const result = await enrichNextTrack("auth0|listener", deps);

    expect(result).toEqual({ processed: false, remaining: 2 });
    expect(deps.lookupArtistGenres).not.toHaveBeenCalled();
    expect(deps.completeJob).not.toHaveBeenCalled();
    expect(deps.releaseJob).toHaveBeenCalledWith("auth0|listener", "track-1");
  });

  it("schedules a retry for retryable MusicBrainz failures", async () => {
    const deps = dependencies({
      lookup: vi.fn().mockRejectedValue(new MusicBrainzError("retryable")),
    });

    const result = await enrichNextTrack("auth0|listener", deps);

    expect(result).toEqual({ processed: false, remaining: 2 });
    expect(deps.retryJob).toHaveBeenCalledWith(
      "auth0|listener",
      "track-1",
      1,
      "musicbrainz_retryable",
    );
    expect(deps.completeJob).not.toHaveBeenCalled();
  });
});
