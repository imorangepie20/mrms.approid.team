import Hls from "hls.js";

import type { Track } from "@/lib/music/types";
import type { TidalPlaybackStream } from "@/lib/tidal/playback-stream";

export type PlaybackSource = "playlist" | "search" | "ems" | "mms" | "gms";
export type PlayableTrack = Track & { durationSeconds: number | null; tidalTrackId: string };
export type PlaybackEvent =
  | { state: "idle" | "paused" | "playing" | "stalled"; type: "state" }
  | { type: "position"; positionSeconds: number }
  | { type: "duration"; durationSeconds: number }
  | { type: "ended"; reason: string; referenceId: string | null }
  | { type: "transition"; productId: string; referenceId: string | null }
  | { type: "error"; code: string };
export type PlaybackQueueSource = { id: string; referenceId: string; type: PlaybackSource };

export interface PlaybackEngine {
  initialize(): Promise<void>;
  load(track: PlayableTrack, source: PlaybackQueueSource): Promise<void>;
  pause(): Promise<void>;
  play(): Promise<void>;
  reset(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(level: number): Promise<void>;
  setNext(track: PlayableTrack | null, source: PlaybackQueueSource): Promise<void>;
  subscribe(listener: (event: PlaybackEvent) => void): () => void;
}

type HlsLike = {
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  loadSource(url: string): void;
  on(event: string, listener: (event: string, data: { fatal?: boolean; details?: string }) => void): void;
};

type EngineDependencies = {
  createAudio?: () => HTMLAudioElement;
  createHls?: () => HlsLike;
  fetchStream?: (trackId: string) => Promise<TidalPlaybackStream>;
};

async function fetchPlaybackStream(trackId: string): Promise<TidalPlaybackStream> {
  const response = await fetch(`/api/tidal/tracks/${encodeURIComponent(trackId)}/stream`, {
    cache: "no-store",
  });
  const body = (await response.json()) as TidalPlaybackStream | { code?: string };
  if (!response.ok) {
    throw new Error("code" in body && body.code ? body.code : "tidal_playback_upstream_failed");
  }
  return body as TidalPlaybackStream;
}

function isHls(stream: TidalPlaybackStream) {
  return stream.manifestMimeType?.toLowerCase().includes("mpegurl") || /\.m3u8(?:\?|$)/i.test(stream.streamUrl);
}

export function createTidalPlaybackEngine(dependencies: EngineDependencies = {}): PlaybackEngine {
  const createAudio = dependencies.createAudio ?? (() => document.createElement("audio"));
  const createHls = dependencies.createHls ?? (() => new Hls() as HlsLike);
  const fetchStream = dependencies.fetchStream ?? fetchPlaybackStream;
  const listeners = new Set<(event: PlaybackEvent) => void>();
  let audio: HTMLAudioElement | null = null;
  let hls: HlsLike | null = null;
  let generation = 0;
  let volume = 100;

  const emit = (event: PlaybackEvent) => listeners.forEach((listener) => listener(event));

  const clear = () => {
    hls?.destroy();
    hls = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audio = null;
  };

  const attachEvents = (media: HTMLAudioElement, activeGeneration: number, activeReference: string) => {
    const active = () => generation === activeGeneration && audio === media;
    media.addEventListener("playing", () => active() && emit({ state: "playing", type: "state" }));
    media.addEventListener("pause", () => active() && !media.ended && emit({ state: "paused", type: "state" }));
    media.addEventListener("waiting", () => active() && emit({ state: "stalled", type: "state" }));
    media.addEventListener("timeupdate", () => active() && emit({ positionSeconds: media.currentTime, type: "position" }));
    media.addEventListener("durationchange", () => {
      if (active() && Number.isFinite(media.duration)) emit({ durationSeconds: media.duration, type: "duration" });
    });
    media.addEventListener("ended", () => {
      if (active()) emit({ reason: "completed", referenceId: activeReference, type: "ended" });
    });
    media.addEventListener("error", () => active() && emit({ code: "tidal_stream_media_error", type: "error" }));
  };

  return {
    async initialize() {
      if (typeof window === "undefined") throw new Error("tidal_player_browser_required");
    },
    async load(track, source) {
      const activeGeneration = ++generation;
      clear();
      const stream = await fetchStream(track.tidalTrackId);
      if (generation !== activeGeneration) return;
      const media = createAudio();
      audio = media;
      media.preload = "auto";
      media.volume = Math.min(1, Math.max(0, volume / 100));
      attachEvents(media, activeGeneration, source.referenceId);
      if (isHls(stream) && !media.canPlayType("application/vnd.apple.mpegurl")) {
        const instance = createHls();
        hls = instance;
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal && generation === activeGeneration) {
            emit({ code: data.details || "tidal_hls_error", type: "error" });
          }
        });
        instance.loadSource(stream.streamUrl);
        instance.attachMedia(media);
      } else {
        media.src = stream.streamUrl;
      }
      if (stream.durationSeconds && stream.durationSeconds > 0) {
        emit({ durationSeconds: stream.durationSeconds, type: "duration" });
      }
      emit({ productId: track.tidalTrackId, referenceId: source.referenceId, type: "transition" });
      emit({ state: "paused", type: "state" });
    },
    async pause() {
      audio?.pause();
    },
    async play() {
      if (!audio) throw new Error("tidal_stream_not_loaded");
      await audio.play();
    },
    async reset() {
      generation += 1;
      clear();
      emit({ state: "idle", type: "state" });
    },
    async seek(seconds) {
      if (!audio) return;
      const upper = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number.POSITIVE_INFINITY;
      audio.currentTime = Math.min(upper, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    },
    async setVolume(level) {
      volume = Math.min(100, Math.max(0, Number.isFinite(level) ? level : 0));
      if (audio) audio.volume = volume / 100;
    },
    async setNext() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let singleton: PlaybackEngine | null = null;

export function getTidalPlaybackEngine() {
  singleton ??= createTidalPlaybackEngine();
  return singleton;
}
