import { describe, expect, it } from "vitest";

import { catalog } from "./fixtures";
import { applyPreference, getGatewayTracks } from "./recommendations";
import type { MusicState } from "./types";

const initialState: MusicState = {
  mmsTrackIds: ["t-1"],
  rejectedTrackIds: [],
};

describe("recommendations", () => {
  it("excludes a rejected track from future gateway tracks", () => {
    const tracks = getGatewayTracks(catalog, ["t-1"], ["t-3"]);

    expect(tracks.map((track) => track.id)).not.toContain("t-3");
  });

  it("does not remove a rejected track from the public catalog", () => {
    const next = applyPreference(initialState, "t-3", "reject");

    expect(catalog.map((track) => track.id)).toContain("t-3");
    expect(next.rejectedTrackIds).toContain("t-3");
  });

  it("removes a rejected MMS track while preserving the rejection", () => {
    const next = applyPreference(initialState, "t-1", "reject");

    expect(next.mmsTrackIds).not.toContain("t-1");
    expect(next.rejectedTrackIds).toContain("t-1");
  });

  it("adds an accepted track to MMS only once", () => {
    const once = applyPreference(initialState, "t-2", "accept");
    const twice = applyPreference(once, "t-2", "accept");

    expect(twice.mmsTrackIds.filter((trackId) => trackId === "t-2")).toHaveLength(1);
  });
});
