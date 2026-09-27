export type DecodedPcmSegment = {
  duration: number;
  sampleRate: number;
  samples: Float32Array;
};

function audioContextConstructor() {
  return window.AudioContext ?? (
    window as Window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext;
}

function createDecodeContext() {
  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor) throw new Error("audio_context_unavailable");
  return new AudioContextConstructor();
}

function concatBytes(chunks: Uint8Array[]) {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const merged = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function decode(data: ArrayBuffer): Promise<DecodedPcmSegment> {
  const context = createDecodeContext();
  try {
    const decoded = await context.decodeAudioData(data.slice(0));
    const channelCount = Math.max(1, decoded.numberOfChannels);
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < channelCount; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < channelData.length; index += 1) {
        samples[index] += channelData[index] / channelCount;
      }
    }
    return { duration: decoded.duration, sampleRate: decoded.sampleRate, samples };
  } finally {
    void context.close().catch(() => undefined);
  }
}

export function decodeFragmentedMp4Segment(initSegment: Uint8Array, mediaSegment: Uint8Array) {
  return decode(toArrayBuffer(concatBytes([initSegment, mediaSegment])));
}

export function decodeCompleteAudioData(data: ArrayBuffer) {
  return decode(data);
}

export function supportsAudioDecoding() {
  return typeof window !== "undefined" && Boolean(audioContextConstructor());
}
