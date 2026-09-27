import Hls from "hls.js";

export type CapturedAudioSegment = {
  duration: number | null;
  endTime: number | null;
  initSegment: Uint8Array | null;
  kind: "init" | "media" | "unknown";
  payload: Uint8Array;
  startTime: number | null;
  type: "audio" | "audiovideo";
};

export type TidalAudioCaptureEvent =
  | { type: "reset" }
  | { source: "direct" | "hls" | "native-hls"; type: "source" }
  | { segment: CapturedAudioSegment; type: "segment" }
  | {
      quality: string;
      startTime: number | null;
      trackId: string;
      type: "direct-stream";
      url: string;
    };

export type AudioCaptureTarget = {
  off?: (event: string, listener: (event: string, data: unknown) => void) => void;
  on: (event: string, listener: (event: string, data: unknown) => void) => void;
};

type Subscriber = (event: TidalAudioCaptureEvent) => void;

const subscribers = new Set<Subscriber>();
const initSegments = new Map<CapturedAudioSegment["type"], Uint8Array>();
let attachedTarget: AudioCaptureTarget | null = null;
let detachListeners: (() => void) | null = null;
let currentSource: TidalAudioCaptureEvent | null = null;
let currentDirectStream: TidalAudioCaptureEvent | null = null;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function bytes(value: unknown) {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  return null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function emit(event: TidalAudioCaptureEvent) {
  if (event.type === "reset") {
    currentSource = null;
    currentDirectStream = null;
  } else if (event.type === "source") {
    currentSource = event;
    if (event.source !== "direct") currentDirectStream = null;
  } else if (event.type === "direct-stream") {
    currentDirectStream = event;
  }
  subscribers.forEach((subscriber) => subscriber(event));
}

function readAscii(data: Uint8Array, start: number) {
  return String.fromCharCode(...data.slice(start, start + 4));
}

function topLevelBoxes(data: Uint8Array) {
  const result: string[] = [];
  let offset = 0;
  while (offset + 8 <= data.length && result.length < 4) {
    const size = (
      data[offset] * 0x1000000 +
      data[offset + 1] * 0x10000 +
      data[offset + 2] * 0x100 +
      data[offset + 3]
    );
    const type = readAscii(data, offset + 4);
    if (size < 8 || !/^[\x20-\x7e]{4}$/.test(type)) break;
    result.push(type);
    offset += size;
  }
  return result;
}

export function classifyCapturedSegment(payload: Uint8Array, sequence: unknown) {
  if (sequence === "initSegment") return "init" as const;
  const boxes = topLevelBoxes(payload);
  if (boxes.includes("ftyp") || boxes.includes("moov")) return "init" as const;
  if (boxes.includes("moof") || boxes.includes("mdat")) return "media" as const;
  return "unknown" as const;
}

function sourceBufferType(value: unknown): CapturedAudioSegment["type"] | null {
  return value === "audio" || value === "audiovideo" ? value : null;
}

function rememberCodecInitSegments(data: unknown) {
  if (!record(data)) return;
  for (const type of ["audio", "audiovideo"] as const) {
    const details = data[type];
    const init = record(details) ? bytes(details.initSegment) : null;
    if (init) initSegments.set(type, init);
  }
}

function initFor(type: CapturedAudioSegment["type"]) {
  return initSegments.get(type)
    ?? (type === "audio" ? initSegments.get("audiovideo") : initSegments.get("audio"))
    ?? null;
}

export function detachTidalAudioCapture() {
  detachListeners?.();
  detachListeners = null;
  attachedTarget = null;
  initSegments.clear();
  emit({ type: "reset" });
}

export function attachTidalAudioCapture(target: AudioCaptureTarget) {
  if (attachedTarget === target) return;
  detachTidalAudioCapture();
  attachedTarget = target;
  emit({ source: "hls", type: "source" });

  const onCodecs = (_event: string, data: unknown) => rememberCodecInitSegments(data);
  const onAppending = (_event: string, data: unknown) => {
    if (!record(data)) return;
    const type = sourceBufferType(data.type);
    const payload = bytes(data.data);
    const fragment = record(data.frag) ? data.frag : {};
    if (!type || !payload) return;

    const kind = classifyCapturedSegment(payload, fragment.sn);
    if (kind === "init") initSegments.set(type, payload.slice());
    const startTime = finiteNumber(fragment.startPTS) ?? finiteNumber(fragment.start);
    const duration = finiteNumber(fragment.duration);
    emit({
      segment: {
        duration,
        endTime: finiteNumber(fragment.endPTS) ?? (
          startTime !== null && duration !== null ? startTime + duration : null
        ),
        initSegment: initFor(type)?.slice() ?? null,
        kind,
        payload,
        startTime,
        type,
      },
      type: "segment",
    });
  };

  target.on(Hls.Events.BUFFER_CODECS, onCodecs);
  target.on(Hls.Events.BUFFER_APPENDING, onAppending);
  detachListeners = () => {
    target.off?.(Hls.Events.BUFFER_CODECS, onCodecs);
    target.off?.(Hls.Events.BUFFER_APPENDING, onAppending);
  };
}

export function notifyNativeHlsTidalAudioSource() {
  detachTidalAudioCapture();
  emit({ source: "native-hls", type: "source" });
}

export function notifyDirectTidalAudioSource(
  url: string,
  trackId: string,
  quality: string,
  startTime: number | null = null,
) {
  detachTidalAudioCapture();
  emit({ source: "direct", type: "source" });
  emit({ quality, startTime, trackId, type: "direct-stream", url });
}

export function subscribeTidalAudioCapture(subscriber: Subscriber) {
  subscribers.add(subscriber);
  if (currentSource) subscriber(currentSource);
  if (currentDirectStream) subscriber(currentDirectStream);
  return () => {
    subscribers.delete(subscriber);
  };
}
