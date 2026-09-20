import { describe, expect, it, vi } from "vitest";

import { createTidalPlaybackEngine, getTidalPlaybackEngine, type PlaybackEvent, type PlayableTrack } from "./player";

const track: PlayableTrack = {
  album: "Album", artist: "Artist", artworkClass: "artwork-violet", artworkUrl: "",
  durationSeconds: 185, id: "search-track", tidalTrackId: "42", title: "Track",
};
const source = { id: "search:q", referenceId: "ref-1", type: "search" as const };

function audioFixture() {
  const audio = document.createElement("audio");
  vi.spyOn(audio, "play").mockResolvedValue(undefined);
  vi.spyOn(audio, "pause").mockImplementation(() => undefined);
  vi.spyOn(audio, "load").mockImplementation(() => undefined);
  vi.spyOn(audio, "removeAttribute");
  return audio;
}

const directStream = {
  assetPresentation: "FULL" as const, audioQuality: "LOSSLESS", codec: "flac",
  durationSeconds: 185, manifestMimeType: "audio/flac", streamUrl: "https://audio.example/42.flac",
};

describe("TIDAL playback engine", () => {
  it("keeps one lazy singleton", () => {
    expect(getTidalPlaybackEngine()).toBe(getTidalPlaybackEngine());
  });

  it("loads and plays a FULL direct stream", async () => {
    const audio = audioFixture();
    const fetchStream = vi.fn().mockResolvedValue(directStream);
    const engine = createTidalPlaybackEngine({ createAudio: () => audio, fetchStream });
    await engine.load(track, source);
    await engine.play();
    expect(fetchStream).toHaveBeenCalledWith("42");
    expect(audio.src).toBe("https://audio.example/42.flac");
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("uses hls.js when native HLS is unavailable", async () => {
    const audio = audioFixture();
    vi.spyOn(audio, "canPlayType").mockReturnValue("");
    const hls = { attachMedia: vi.fn(), destroy: vi.fn(), loadSource: vi.fn(), on: vi.fn() };
    const engine = createTidalPlaybackEngine({
      createAudio: () => audio,
      createHls: () => hls,
      fetchStream: vi.fn().mockResolvedValue({ ...directStream, manifestMimeType: "application/vnd.apple.mpegurl", streamUrl: "https://audio.example/42.m3u8" }),
    });
    await engine.load(track, source);
    expect(hls.loadSource).toHaveBeenCalledWith("https://audio.example/42.m3u8");
    expect(hls.attachMedia).toHaveBeenCalledWith(audio);
  });

  it("maps active media events and ignores stale media events", async () => {
    const first = audioFixture();
    const second = audioFixture();
    const engine = createTidalPlaybackEngine({
      createAudio: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
      fetchStream: vi.fn().mockResolvedValue(directStream),
    });
    const events: PlaybackEvent[] = [];
    engine.subscribe((event) => events.push(event));
    await engine.load(track, source);
    await engine.load({ ...track, tidalTrackId: "43" }, { ...source, referenceId: "ref-2" });
    first.dispatchEvent(new Event("ended"));
    second.dispatchEvent(new Event("playing"));
    second.dispatchEvent(new Event("waiting"));
    second.dispatchEvent(new Event("ended"));
    expect(events).toContainEqual({ state: "playing", type: "state" });
    expect(events).toContainEqual({ state: "stalled", type: "state" });
    expect(events.filter((event) => event.type === "ended")).toEqual([
      { reason: "completed", referenceId: "ref-2", type: "ended" },
    ]);
  });

  it("clamps seek and percentage volume and clears media on reset", async () => {
    const audio = audioFixture();
    vi.spyOn(audio, "canPlayType").mockReturnValue("");
    const hls = { attachMedia: vi.fn(), destroy: vi.fn(), loadSource: vi.fn(), on: vi.fn() };
    const engine = createTidalPlaybackEngine({
      createAudio: () => audio, createHls: () => hls,
      fetchStream: vi.fn().mockResolvedValue({ ...directStream, manifestMimeType: "application/vnd.apple.mpegurl", streamUrl: "https://audio.example/42.m3u8" }),
    });
    await engine.load(track, source);
    await engine.seek(-10);
    await engine.setVolume(130);
    await engine.reset();
    expect(audio.currentTime).toBe(0);
    expect(audio.volume).toBe(1);
    expect(hls.destroy).toHaveBeenCalled();
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
  });
});
