import { afterEach, describe, expect, it, vi } from "vitest";
import Hls from "hls.js";

import {
  attachTidalAudioCapture,
  classifyCapturedSegment,
  detachTidalAudioCapture,
  notifyDirectTidalAudioSource,
  subscribeTidalAudioCapture,
  type TidalAudioCaptureEvent,
} from "./audio-capture";

function mp4Box(type: string) {
  return new Uint8Array([0, 0, 0, 8, ...Array.from(type).map((character) => character.charCodeAt(0))]);
}

describe("TIDAL audio capture", () => {
  afterEach(() => detachTidalAudioCapture());

  it("classifies fMP4 init and media payloads", () => {
    expect(classifyCapturedSegment(mp4Box("ftyp"), 1)).toBe("init");
    expect(classifyCapturedSegment(mp4Box("moof"), 2)).toBe("media");
  });

  it("captures an audio media segment with its remembered init segment", () => {
    const listeners = new Map<string, (event: string, data: unknown) => void>();
    const target = {
      off: vi.fn(),
      on: vi.fn((event: string, listener: (event: string, data: unknown) => void) => listeners.set(event, listener)),
    };
    const events: TidalAudioCaptureEvent[] = [];
    const unsubscribe = subscribeTidalAudioCapture((event) => events.push(event));
    attachTidalAudioCapture(target);
    listeners.get(Hls.Events.BUFFER_CODECS)?.("codecs", {
      audio: { initSegment: mp4Box("ftyp") },
    });
    listeners.get(Hls.Events.BUFFER_APPENDING)?.("appending", {
      data: mp4Box("moof"),
      frag: { duration: 2, sn: 1, start: 4 },
      type: "audio",
    });

    const captured = events.find((event) => event.type === "segment");
    expect(captured).toMatchObject({
      segment: { duration: 2, kind: "media", startTime: 4, type: "audio" },
      type: "segment",
    });
    expect(captured?.type === "segment" ? captured.segment.initSegment : null).toEqual(mp4Box("ftyp"));
    unsubscribe();
  });

  it("replays the current direct source to late subscribers", () => {
    notifyDirectTidalAudioSource("https://audio.example/track.mp4", "42", "HIGH");
    const events: TidalAudioCaptureEvent[] = [];
    const unsubscribe = subscribeTidalAudioCapture((event) => events.push(event));
    expect(events).toEqual([
      { source: "direct", type: "source" },
      {
        quality: "HIGH",
        startTime: null,
        trackId: "42",
        type: "direct-stream",
        url: "https://audio.example/track.mp4",
      },
    ]);
    unsubscribe();
  });
});
