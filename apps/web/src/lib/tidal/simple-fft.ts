const TWO_PI = Math.PI * 2;

export function pcmToByteFrequencyData(samples: Float32Array, target: Uint8Array) {
  const sampleCount = samples.length;
  if (sampleCount === 0 || target.length === 0) {
    target.fill(0);
    return;
  }

  const binLimit = Math.min(target.length, Math.floor(sampleCount / 2));
  for (let bin = 0; bin < target.length; bin += 1) {
    if (bin >= binLimit) {
      target[bin] = 0;
      continue;
    }

    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const windowed = samples[index] * (
        0.5 - 0.5 * Math.cos(TWO_PI * index / Math.max(1, sampleCount - 1))
      );
      const angle = TWO_PI * bin * index / sampleCount;
      real += windowed * Math.cos(angle);
      imaginary -= windowed * Math.sin(angle);
    }

    const magnitude = Math.sqrt(real * real + imaginary * imaginary) / sampleCount;
    target[bin] = Math.round(Math.min(255, Math.log10(1 + magnitude * 160) * 255));
  }
}
