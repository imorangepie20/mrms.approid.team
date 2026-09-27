import { describe, expect, it } from "vitest";

import { pcmToByteFrequencyData } from "./simple-fft";

describe("pcmToByteFrequencyData", () => {
  it("returns silence as zero bins", () => {
    const target = new Uint8Array(8).fill(99);
    pcmToByteFrequencyData(new Float32Array(16), target);
    expect(Array.from(target)).toEqual(new Array(8).fill(0));
  });

  it("places a sine wave peak near its frequency bin", () => {
    const samples = new Float32Array(256);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin(2 * Math.PI * 8 * index / samples.length);
    }
    const target = new Uint8Array(128);
    pcmToByteFrequencyData(samples, target);
    const peak = target.indexOf(Math.max(...target));
    expect(peak).toBeGreaterThanOrEqual(7);
    expect(peak).toBeLessThanOrEqual(9);
  });
});
