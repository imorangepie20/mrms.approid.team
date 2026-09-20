import { describe, expect, it, vi } from "vitest";

import {
  createServerCredentialsProvider,
  createTidalPlaybackEngine,
  getTidalPlaybackEngine,
  type PlaybackEvent,
} from "./player";

function sdkFixture() {
  const events = new EventTarget();
  const media = document.createElement("audio");
  const sdk = {
    bootstrap: vi.fn(),
    events,
    getMediaElement: vi.fn(() => media),
    load: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    setCredentialsProvider: vi.fn(),
    setNext: vi.fn().mockResolvedValue(undefined),
  };
  return { events, media, sdk };
}

describe("TIDAL playback engine", () => {
  it("does not import the SDK before browser initialization and keeps one singleton", () => {
    const sdkImporter = vi.fn();

    createTidalPlaybackEngine({ sdkImporter });

    expect(sdkImporter).not.toHaveBeenCalled();
    expect(getTidalPlaybackEngine()).toBe(getTidalPlaybackEngine());
  });

  it("maps server playback credentials to the SDK provider", async () => {
    const fetchCredentials = vi.fn().mockResolvedValue(
      Response.json({
        clientId: "tidal-client",
        expires: 1_795_000_000_000,
        grantedScopes: ["playback"],
        requestedScopes: ["playback"],
        token: "access",
        userId: "12345",
      }),
    );

    const provider = createServerCredentialsProvider(fetchCredentials);

    await expect(provider.getCredentials()).resolves.toMatchObject({
      clientId: "tidal-client",
      token: "access",
      userId: "12345",
    });
    expect(() => provider.bus(vi.fn())).not.toThrow();
  });

  it("initializes once and maps SDK plus media events", async () => {
    const { events, media, sdk } = sdkFixture();
    const sdkImporter = vi.fn().mockResolvedValue(sdk);
    const engine = createTidalPlaybackEngine({ sdkImporter });
    const received: PlaybackEvent[] = [];
    engine.subscribe((event) => received.push(event));

    const first = engine.initialize();
    const second = engine.initialize();
    expect(first).toBe(second);
    await first;

    events.dispatchEvent(
      new CustomEvent("playback-state-change", {
        detail: { state: "PLAYING" },
      }),
    );
    events.dispatchEvent(
      new CustomEvent("playback-state-change", {
        detail: { state: "NOT_PLAYING" },
      }),
    );
    events.dispatchEvent(
      new CustomEvent("playback-state-change", {
        detail: { state: "STALLED" },
      }),
    );
    events.dispatchEvent(
      new CustomEvent("playback-state-change", {
        detail: { state: "IDLE" },
      }),
    );
    events.dispatchEvent(
      new CustomEvent("ended", {
        detail: {
          mediaProduct: { productId: "track-1", referenceId: "ref-1" },
          reason: "completed",
        },
      }),
    );
    Object.defineProperty(media, "currentTime", { configurable: true, value: 42 });
    Object.defineProperty(media, "duration", { configurable: true, value: 185 });
    media.dispatchEvent(new Event("timeupdate"));
    media.dispatchEvent(new Event("durationchange"));
    events.dispatchEvent(new ErrorEvent("error", { message: "asset failed" }));
    events.dispatchEvent(new CustomEvent("error", {
      detail: { errorCode: "S1000", errorId: "PENetwork" },
    }));

    expect(sdkImporter).toHaveBeenCalledTimes(1);
    expect(sdk.bootstrap).toHaveBeenCalledTimes(1);
    expect(received).toEqual(
      expect.arrayContaining([
        { state: "playing", type: "state" },
        { state: "paused", type: "state" },
        { state: "stalled", type: "state" },
        { state: "idle", type: "state" },
        { reason: "completed", referenceId: "ref-1", type: "ended" },
        { positionSeconds: 42, type: "position" },
        { durationSeconds: 185, type: "duration" },
        { code: "asset failed", type: "error" },
        { code: "S1000", type: "error" },
      ]),
    );
  });

  it("loads opaque track IDs and source metadata without rewriting them", async () => {
    const { sdk } = sdkFixture();
    const engine = createTidalPlaybackEngine({
      sdkImporter: vi.fn().mockResolvedValue(sdk),
    });
    await engine.initialize();

    await engine.load(
      {
        album: "Album",
        artist: "Artist",
        artworkClass: "artwork-violet",
        artworkUrl: "",
        durationSeconds: 185,
        id: "search-track",
        tidalTrackId: "track:opaque/01",
        title: "Track",
      },
      { id: "search:query", referenceId: "ref-7", type: "search" },
    );

    expect(sdk.load).toHaveBeenCalledWith({
      productId: "track:opaque/01",
      productType: "track",
      referenceId: "ref-7",
      sourceId: "search:query",
      sourceType: "search",
    });
  });
});
