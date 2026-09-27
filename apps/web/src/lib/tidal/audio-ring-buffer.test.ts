import { describe, expect, it } from "vitest";

import { AudioRingBuffer } from "./audio-ring-buffer";

describe("AudioRingBuffer", () => {
  it("reads a PCM window aligned to playback time", () => {
    const buffer = new AudioRingBuffer();
    buffer.append({
      sampleRate: 4,
      samples: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      startTime: 2,
    });

    expect(Array.from(buffer.readWindow(3, 4) ?? [])).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
      expect.closeTo(0.4),
    ]);
  });

  it("ignores invalid segments and falls back to the newest samples", () => {
    const buffer = new AudioRingBuffer();
    buffer.append({ sampleRate: 0, samples: new Float32Array([1]), startTime: 0 });
    expect(buffer.readWindow(0, 2)).toBeNull();
    buffer.append({ sampleRate: 2, samples: new Float32Array([0.25, 0.5]), startTime: 4 });
    expect(Array.from(buffer.readWindow(Number.NaN, 3) ?? [])).toEqual([0, 0.25, 0.5]);
  });
});
