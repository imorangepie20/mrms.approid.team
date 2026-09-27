export type PcmAudioSegment = {
  sampleRate: number;
  samples: Float32Array;
  startTime: number;
};

export class AudioRingBuffer {
  private readonly keepSeconds: number;
  private segments: PcmAudioSegment[] = [];

  constructor(keepSeconds = 12) {
    this.keepSeconds = keepSeconds;
  }

  clear() {
    this.segments = [];
  }

  append(segment: PcmAudioSegment) {
    if (!Number.isFinite(segment.startTime) || segment.sampleRate <= 0 || segment.samples.length === 0) {
      return;
    }

    this.segments.push(segment);
    this.segments.sort((left, right) => left.startTime - right.startTime);
    const latestEnd = this.segments.reduce(
      (latest, item) => Math.max(latest, this.endTime(item)),
      0,
    );
    const cutoff = Math.max(0, latestEnd - this.keepSeconds);
    this.segments = this.segments.filter((item) => this.endTime(item) >= cutoff);
  }

  readWindow(currentTime: number, sampleCount: number) {
    const latest = this.segments[this.segments.length - 1];
    if (!latest) return null;
    if (!Number.isFinite(currentTime)) return this.latestWindow(sampleCount);

    const output = new Float32Array(sampleCount);
    const startTime = currentTime - sampleCount / latest.sampleRate;
    let filled = 0;

    for (let index = 0; index < sampleCount; index += 1) {
      const time = startTime + index / latest.sampleRate;
      const segment = this.segments.find(
        (candidate) => time >= candidate.startTime && time <= this.endTime(candidate),
      );
      if (!segment) continue;
      const sampleIndex = Math.floor((time - segment.startTime) * segment.sampleRate);
      if (sampleIndex >= 0 && sampleIndex < segment.samples.length) {
        output[index] = segment.samples[sampleIndex];
        filled += 1;
      }
    }

    return filled > 0 ? output : this.latestWindow(sampleCount);
  }

  private latestWindow(sampleCount: number) {
    const latest = this.segments[this.segments.length - 1];
    if (!latest) return null;
    const output = new Float32Array(sampleCount);
    const start = Math.max(0, latest.samples.length - sampleCount);
    const samples = latest.samples.slice(start);
    output.set(samples, sampleCount - samples.length);
    return output;
  }

  private endTime(segment: PcmAudioSegment) {
    return segment.startTime + segment.samples.length / segment.sampleRate;
  }
}
