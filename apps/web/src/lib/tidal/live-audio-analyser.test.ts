import { afterEach, describe, expect, it, vi } from "vitest";

import { analysisAudioUrl, createLiveAudioAnalyser } from "./live-audio-analyser";

class FakeAudio extends EventTarget {
  currentTime = 0;
  load = vi.fn();
  muted = false;
  pause = vi.fn(() => {
    this.paused = true;
  });
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
    queueMicrotask(() => this.dispatchEvent(new Event("playing")));
  });
  preload = "";
  removeAttribute = vi.fn();
  src = "";
}

function audioNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

describe("live TIDAL audio analyser", () => {
  afterEach(() => vi.restoreAllMocks());

  it("streams same-origin analysis audio into a silent Web Audio graph", async () => {
    const audio = new FakeAudio();
    const source = audioNode();
    const analyser = {
      ...audioNode(),
      fftSize: 0,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn((target: Uint8Array) => target.fill(37)),
      smoothingTimeConstant: 0,
    };
    const silence = {
      ...audioNode(),
      gain: { value: 1 },
    };
    const context = {
      close: vi.fn().mockResolvedValue(undefined),
      createAnalyser: vi.fn(() => analyser),
      createGain: vi.fn(() => silence),
      createMediaElementSource: vi.fn(() => source),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
    };
    function AudioContextMock() {
      return context;
    }
    vi.stubGlobal("AudioContext", AudioContextMock);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "audio") return audio;
      throw new Error(`unexpected_element:${tagName}`);
    }) as typeof document.createElement);

    const live = createLiveAudioAnalyser("track:42", 0);
    await live.ready;
    const values = new Uint8Array(live.binCount);
    live.read(values);

    expect(audio.src).toBe("/api/tidal/tracks/track%3A42/analysis?quality=LOW");
    expect(audio.muted).toBe(false);
    expect(analyser.fftSize).toBe(256);
    expect(analyser.smoothingTimeConstant).toBe(0.72);
    expect(silence.gain.value).toBe(0);
    expect(values.every((value) => value === 37)).toBe(true);

    live.sync(false, 12);
    expect(audio.currentTime).toBe(12);
    expect(audio.pause).toHaveBeenCalled();
    live.dispose();
    expect(context.close).toHaveBeenCalled();
  });

  it("encodes a track id in the analysis URL", () => {
    expect(analysisAudioUrl("42/next")).toBe(
      "/api/tidal/tracks/42%2Fnext/analysis?quality=LOW",
    );
  });
});
