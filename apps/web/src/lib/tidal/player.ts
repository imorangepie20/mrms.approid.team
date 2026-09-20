import type { Track } from "@/lib/music/types";

export type PlaybackSource = "playlist" | "search" | "mms" | "gms";
export type PlayableTrack = Track & {
  durationSeconds: number | null;
  tidalTrackId: string;
};

export type PlaybackEvent =
  | { state: "idle" | "paused" | "playing" | "stalled"; type: "state" }
  | { type: "position"; positionSeconds: number }
  | { type: "duration"; durationSeconds: number }
  | { type: "ended"; reason: string; referenceId: string | null }
  | { type: "transition"; productId: string; referenceId: string | null }
  | { type: "error"; code: string };

export type PlaybackQueueSource = {
  id: string;
  referenceId: string;
  type: PlaybackSource;
};

export interface PlaybackEngine {
  initialize(): Promise<void>;
  load(track: PlayableTrack, source: PlaybackQueueSource): Promise<void>;
  pause(): Promise<void>;
  play(): Promise<void>;
  reset(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setNext(
    track: PlayableTrack | null,
    source: PlaybackQueueSource,
  ): Promise<void>;
  subscribe(listener: (event: PlaybackEvent) => void): () => void;
}

type PlayerSdk = {
  bootstrap(options: {
    outputDevices: boolean;
    players: Array<{ itemTypes: ["track"]; player: "browser" }>;
  }): void;
  events: EventTarget;
  getMediaElement(): HTMLMediaElement | null;
  load(mediaProduct: MediaProduct): Promise<void>;
  pause(): Promise<void>;
  play(): Promise<void>;
  reset(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setCredentialsProvider(provider: CredentialsProvider): void;
  setNext(mediaProduct?: MediaProduct): Promise<void>;
};

type MediaProduct = {
  productId: string;
  productType: "track";
  referenceId: string;
  sourceId: string;
  sourceType: PlaybackSource;
};

type PlaybackCredentials = {
  clientId: string;
  expires: number;
  grantedScopes: string[];
  requestedScopes: string[];
  token: string;
  userId: string;
};

type CredentialsProvider = {
  bus(listener: (event: CustomEvent<{ type: "CredentialsUpdatedMessage" }>) => void): void;
  getCredentials(): Promise<PlaybackCredentials>;
};

type EngineDependencies = {
  credentialsProvider?: CredentialsProvider;
  sdkImporter?: () => Promise<PlayerSdk>;
};

export function createServerCredentialsProvider(
  fetchCredentials: typeof fetch = fetch,
): CredentialsProvider {
  return {
    bus() {},
    async getCredentials() {
      const response = await fetchCredentials("/api/tidal/playback-credentials", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("tidal_playback_credentials_failed");
      return (await response.json()) as PlaybackCredentials;
    },
  };
}

function mediaProduct(track: PlayableTrack, source: PlaybackQueueSource) {
  return {
    productId: track.tidalTrackId,
    productType: "track" as const,
    referenceId: source.referenceId,
    sourceId: source.id,
    sourceType: source.type,
  };
}

export function createTidalPlaybackEngine(
  dependencies: EngineDependencies = {},
): PlaybackEngine {
  const importSdk =
    dependencies.sdkImporter ??
    (() => import("@tidal-music/player") as unknown as Promise<PlayerSdk>);
  const credentialsProvider =
    dependencies.credentialsProvider ?? createServerCredentialsProvider();
  const listeners = new Set<(event: PlaybackEvent) => void>();
  let initialization: Promise<void> | null = null;
  let sdk: PlayerSdk | null = null;
  let attachedMedia: HTMLMediaElement | null = null;

  const emit = (event: PlaybackEvent) => {
    listeners.forEach((listener) => listener(event));
  };

  const attachMediaEvents = () => {
    const media = sdk?.getMediaElement() ?? null;
    if (!media || media === attachedMedia) return;
    attachedMedia = media;
    media.addEventListener("timeupdate", () =>
      emit({ positionSeconds: media.currentTime, type: "position" }),
    );
    media.addEventListener("durationchange", () =>
      emit({ durationSeconds: Number.isFinite(media.duration) ? media.duration : 0, type: "duration" }),
    );
    media.addEventListener("waiting", () =>
      emit({ state: "stalled", type: "state" }),
    );
    media.addEventListener("playing", () =>
      emit({ state: "playing", type: "state" }),
    );
  };

  const requireSdk = () => {
    if (!sdk) throw new Error("tidal_player_not_initialized");
    return sdk;
  };

  const initialize = () => {
    if (initialization) return initialization;
    if (typeof window === "undefined") {
      return Promise.reject(new Error("tidal_player_browser_required"));
    }
    initialization = importSdk()
      .then((loadedSdk) => {
        sdk = loadedSdk;
        loadedSdk.setCredentialsProvider(credentialsProvider);
        loadedSdk.bootstrap({
          outputDevices: false,
          players: [{ itemTypes: ["track"], player: "browser" }],
        });
        loadedSdk.events.addEventListener("playback-state-change", (event) => {
          const state = (event as CustomEvent<{ state?: string }>).detail?.state;
          const normalized = {
            IDLE: "idle",
            NOT_PLAYING: "paused",
            PLAYING: "playing",
            STALLED: "stalled",
          }[state ?? ""] as "idle" | "paused" | "playing" | "stalled" | undefined;
          if (normalized) emit({ state: normalized, type: "state" });
        });
        loadedSdk.events.addEventListener("media-product-transition", (event) => {
          const product = (event as CustomEvent<{
            mediaProduct?: { productId?: string; referenceId?: string };
          }>).detail?.mediaProduct;
          attachMediaEvents();
          if (product?.productId) {
            emit({
              productId: product.productId,
              referenceId: product.referenceId ?? null,
              type: "transition",
            });
          }
        });
        loadedSdk.events.addEventListener("ended", (event) => {
          const detail = (event as CustomEvent<{
            mediaProduct?: { referenceId?: string };
            reason?: string;
          }>).detail;
          emit({
            reason: detail?.reason ?? "unknown",
            referenceId: detail?.mediaProduct?.referenceId ?? null,
            type: "ended",
          });
        });
        loadedSdk.events.addEventListener("error", (event) => {
          const detail = (event as CustomEvent<{
            code?: string;
            errorCode?: string;
            errorId?: string;
            message?: string;
          }>).detail;
          emit({
            code:
              detail?.code ??
              detail?.errorCode ??
              detail?.errorId ??
              detail?.message ??
              (event instanceof ErrorEvent ? event.message : "tidal_playback_error"),
            type: "error",
          });
        });
        attachMediaEvents();
      })
      .catch((error) => {
        initialization = null;
        sdk = null;
        throw error;
      });
    return initialization;
  };

  return {
    initialize,
    async load(track, source) {
      await initialize();
      await requireSdk().load(mediaProduct(track, source));
      attachMediaEvents();
    },
    async pause() {
      await requireSdk().pause();
    },
    async play() {
      await requireSdk().play();
    },
    async reset() {
      await requireSdk().reset();
    },
    async seek(seconds) {
      await requireSdk().seek(seconds);
    },
    async setNext(track, source) {
      await requireSdk().setNext(track ? mediaProduct(track, source) : undefined);
    },
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
