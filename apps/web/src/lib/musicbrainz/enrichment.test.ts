import { describe, expect, it, vi } from "vitest";

import { MusicBrainzError } from "./client";
import {
  classifyRecordings,
  enrichNextTrack,
  type EnrichmentDependencies,
} from "./enrichment";

function recording(id: string, releases: unknown[] = []) {
  return { id, releases };
}

describe("MusicBrainz enrichment decisions", () => {
  it.each([
    [[], "not_found"],
    [[recording("a")], "matched"],
    [[recording("a"), recording("b")], "ambiguous"],
  ])("classifies recording candidates as %s", (recordings, status) => {
    expect(classifyRecordings({ recordings }, "Album")).toMatchObject({ status });
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
    lookup: vi.fn().mockResolvedValue({ recordings: [recording("recording-a")] }),
    releaseJob: vi.fn().mockResolvedValue(undefined),
    reserveRequest: vi.fn().mockResolvedValue(true),
    retryJob: vi.fn().mockResolvedValue(undefined),
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

  it("does not call MusicBrainz when the global request slot is unavailable", async () => {
    const deps = dependencies({ reserveRequest: vi.fn().mockResolvedValue(false) });

    const result = await enrichNextTrack("auth0|listener", deps);

    expect(result).toEqual({ processed: false, remaining: 2 });
    expect(deps.lookup).not.toHaveBeenCalled();
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
