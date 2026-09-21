"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { catalog } from "@/lib/music/fixtures";
import { applyPreference } from "@/lib/music/recommendations";
import type { MusicState, PlaybackStatus, Track } from "@/lib/music/types";
import {
  getTidalPlaybackEngine,
  type PlaybackEngine,
  type PlaybackEvent,
  type PlaybackSource,
  type PlayableTrack,
} from "@/lib/tidal/player";

export type QueueItem = {
  referenceId: string;
  source: { id: string; type: PlaybackSource };
  track: Track;
};

export type RepeatMode = "off" | "all" | "one";

type PlaybackSessionState = {
  currentIndex: number | null;
  durationSeconds: number;
  errorCode: string | null;
  positionSeconds: number;
  queue: QueueItem[];
  status: PlaybackStatus;
};

type MusicSession = {
  acceptTrack: (trackId: string) => void;
  connectTidal: (selectedPlaylistIds?: string[]) => Promise<void>;
  cycleRepeatMode: () => void;
  currentIndex: number | null;
  currentTrack: Track | null;
  durationSeconds: number;
  initializeMms: (selectedPlaylistIds: string[]) => void;
  isAuthenticated: boolean;
  isPersonalized: boolean;
  isPlaying: boolean;
  isMuted: boolean;
  musicState: MusicState;
  nextTrack: () => Promise<void>;
  pausePlayback: () => Promise<void>;
  playbackError: string | null;
  playbackPosition: number;
  playbackStatus: PlaybackStatus;
  playQueueIndex: (index: number) => Promise<void>;
  playTrack: (
    track: Track,
    source?: { id: string; type: PlaybackSource },
  ) => Promise<void>;
  previousTrack: () => Promise<void>;
  queue: QueueItem[];
  repeatMode: RepeatMode;
  rejectTrack: (trackId: string) => void;
  restoreRejectedTrack: (trackId: string) => void;
  seek: (seconds: number) => Promise<void>;
  setVolume: (level: number) => Promise<void>;
  setPlaybackPosition: (seconds: number) => void;
  setQueue: (
    tracks: Track[],
    source: { id: string; type: PlaybackSource },
  ) => void;
  togglePlayback: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleShuffle: () => void;
  shuffleEnabled: boolean;
  volume: number;
};

type PlaybackAction =
  | { index: number; queue?: QueueItem[]; type: "load" }
  | { event: PlaybackEvent; type: "event" }
  | { queue: QueueItem[]; type: "queue" }
  | { currentIndex: number | null; queue: QueueItem[]; type: "reorder" }
  | { code: string; type: "failure" }
  | { type: "finished" };

const MusicSessionContext = createContext<MusicSession | null>(null);

const initialMusicState: MusicState = {
  mmsTrackIds: [],
  rejectedTrackIds: [],
};

let fallbackReferenceId = 0;

function createReferenceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  fallbackReferenceId += 1;
  return `music-pie-${fallbackReferenceId}`;
}

function queueItems(
  tracks: Track[],
  source: { id: string; type: PlaybackSource },
) {
  return tracks
    .filter((track) => track.playbackAvailable !== false)
    .map((track) => ({
      referenceId: createReferenceId(),
      source,
      track,
    }));
}

function isPlayable(track: Track): track is PlayableTrack {
  return (
    "tidalTrackId" in track &&
    typeof track.tidalTrackId === "string" &&
    track.tidalTrackId.length > 0
  );
}

function playbackReducer(
  state: PlaybackSessionState,
  action: PlaybackAction,
): PlaybackSessionState {
  if (action.type === "queue") {
    return { ...state, currentIndex: null, queue: action.queue };
  }
  if (action.type === "reorder") {
    return { ...state, currentIndex: action.currentIndex, queue: action.queue };
  }
  if (action.type === "load") {
    return {
      ...state,
      currentIndex: action.index,
      durationSeconds: 0,
      errorCode: null,
      positionSeconds: 0,
      queue: action.queue ?? state.queue,
      status: "loading",
    };
  }
  if (action.type === "failure") {
    return { ...state, errorCode: action.code, status: "error" };
  }
  if (action.type === "finished") {
    return { ...state, status: "idle" };
  }
  const event = action.event;
  if (event.type === "state") return { ...state, status: event.state };
  if (event.type === "position") {
    return { ...state, positionSeconds: event.positionSeconds };
  }
  if (event.type === "duration") {
    return { ...state, durationSeconds: event.durationSeconds };
  }
  if (event.type === "error") {
    return { ...state, errorCode: event.code, status: "error" };
  }
  return state;
}

export function MusicSessionProvider({
  children,
  engine = getTidalPlaybackEngine(),
}: {
  children: ReactNode;
  engine?: PlaybackEngine;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [musicState, setMusicState] = useState(initialMusicState);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [volume, setVolumeState] = useState(100);
  const [playback, dispatch] = useReducer(playbackReducer, {
    currentIndex: null,
    durationSeconds: 0,
    errorCode: null,
    positionSeconds: 0,
    queue: queueItems(catalog, { id: "catalog", type: "gms" }),
    status: "idle",
  });
  const playbackRef = useRef(playback);
  const currentReference = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const lastAudibleVolume = useRef(100);
  const repeatModeRef = useRef<RepeatMode>("off");
  const volumeRef = useRef(100);
  const playQueueIndexRef = useRef<(index: number) => Promise<void>>(async () => {});

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const loadItem = useCallback(
    async (item: QueueItem, index: number, replacementQueue?: QueueItem[]) => {
      const generation = ++loadGeneration.current;
      currentReference.current = item.referenceId;
      playbackRef.current = {
        ...playbackRef.current,
        currentIndex: index,
        queue: replacementQueue ?? playbackRef.current.queue,
      };
      dispatch({ index, queue: replacementQueue, type: "load" });
      if (!isPlayable(item.track)) {
        dispatch({ event: { state: "paused", type: "state" }, type: "event" });
        return;
      }
      try {
        await engine.initialize();
        await engine.load(item.track, {
          ...item.source,
          referenceId: item.referenceId,
        });
        if (generation !== loadGeneration.current) return;
        const queue = replacementQueue ?? playbackRef.current.queue;
        const next = repeatModeRef.current === "one"
          ? queue[index]
          : queue[index + 1] ?? (repeatModeRef.current === "all" ? queue[0] : undefined);
        await engine.setNext(
          next && isPlayable(next.track) ? next.track : null,
          next
            ? { ...next.source, referenceId: next.referenceId }
            : { ...item.source, referenceId: item.referenceId },
        );
        if (generation !== loadGeneration.current) return;
        await engine.play();
      } catch (error) {
        if (generation === loadGeneration.current) {
          dispatch({
            code: error instanceof Error ? error.message : "tidal_playback_error",
            type: "failure",
          });
        }
      }
    },
    [engine],
  );

  const playQueueIndex = useCallback(
    async (index: number) => {
      const item = playbackRef.current.queue[index];
      if (item) await loadItem(item, index);
    },
    [loadItem],
  );

  useEffect(() => {
    playQueueIndexRef.current = playQueueIndex;
  }, [playQueueIndex]);

  useEffect(() =>
    engine.subscribe((event) => {
      if (event.type === "transition") {
        if (event.referenceId === currentReference.current) {
          dispatch({ event, type: "event" });
        }
        return;
      }
      if (event.type === "ended") {
        if (event.referenceId !== currentReference.current) return;
        if (repeatModeRef.current === "one") {
          const currentIndex = playbackRef.current.currentIndex;
          if (currentIndex !== null) void playQueueIndexRef.current(currentIndex);
          return;
        }
        const nextIndex = (playbackRef.current.currentIndex ?? -1) + 1;
        if (nextIndex < playbackRef.current.queue.length) {
          void playQueueIndexRef.current(nextIndex);
        } else if (repeatModeRef.current === "all" && playbackRef.current.queue.length > 0) {
          void playQueueIndexRef.current(0);
        } else {
          currentReference.current = null;
          loadGeneration.current += 1;
          void engine.reset();
          dispatch({ type: "finished" });
        }
        return;
      }
      dispatch({ event, type: "event" });
    }),
  [engine]);

  const setQueue = useCallback(
    (tracks: Track[], source: { id: string; type: PlaybackSource }) => {
      const queue = queueItems(tracks, source);
      playbackRef.current = {
        ...playbackRef.current,
        currentIndex: null,
        queue,
      };
      dispatch({ queue, type: "queue" });
    },
    [],
  );

  const playTrack = useCallback(
    async (
      track: Track,
      source: { id: string; type: PlaybackSource } = {
        id: "catalog",
        type: "gms",
      },
    ) => {
      const existingIndex = playbackRef.current.queue.findIndex(
        (item) => item.track === track || item.track.id === track.id,
      );
      if (existingIndex >= 0) {
        await loadItem(playbackRef.current.queue[existingIndex], existingIndex);
        return;
      }
      const replacement = queueItems([track], source);
      await loadItem(replacement[0], 0, replacement);
    },
    [loadItem],
  );

  const nextTrack = useCallback(async () => {
    const index = playbackRef.current.currentIndex;
    if (index === null) return;
    if (index + 1 < playbackRef.current.queue.length) {
      await playQueueIndex(index + 1);
    } else if (repeatModeRef.current === "all" && playbackRef.current.queue.length > 0) {
      await playQueueIndex(0);
    }
  }, [playQueueIndex]);

  const previousTrack = useCallback(async () => {
    const index = playbackRef.current.currentIndex;
    if (index === null) return;
    if (index > 0) {
      await playQueueIndex(index - 1);
    } else if (repeatModeRef.current === "all" && playbackRef.current.queue.length > 0) {
      await playQueueIndex(playbackRef.current.queue.length - 1);
    }
  }, [playQueueIndex]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((current) => {
      const next = current === "off" ? "all" : current === "all" ? "one" : "off";
      repeatModeRef.current = next;
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((enabled) => {
      const nextEnabled = !enabled;
      if (!nextEnabled || playbackRef.current.queue.length < 2) return nextEnabled;
      const currentIndex = playbackRef.current.currentIndex;
      const currentItem = currentIndex === null
        ? null
        : playbackRef.current.queue[currentIndex];
      const upcoming = playbackRef.current.queue.filter((_, index) => index !== currentIndex);
      for (let index = upcoming.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [upcoming[index], upcoming[swapIndex]] = [upcoming[swapIndex], upcoming[index]];
      }
      const queue = currentItem ? [currentItem, ...upcoming] : upcoming;
      const reorderedIndex = currentItem ? 0 : null;
      playbackRef.current = { ...playbackRef.current, currentIndex: reorderedIndex, queue };
      dispatch({ currentIndex: reorderedIndex, queue, type: "reorder" });
      return nextEnabled;
    });
  }, []);

  const setVolume = useCallback(async (level: number) => {
    const normalized = Math.max(0, Math.min(100, Math.round(level)));
    await engine.setVolume(normalized);
    if (normalized > 0) lastAudibleVolume.current = normalized;
    volumeRef.current = normalized;
    setVolumeState(normalized);
  }, [engine]);

  const toggleMute = useCallback(async () => {
    if (volumeRef.current > 0) {
      lastAudibleVolume.current = volumeRef.current;
      await setVolume(0);
    } else {
      await setVolume(lastAudibleVolume.current || 100);
    }
  }, [setVolume]);

  const togglePlayback = useCallback(async () => {
    if (playbackRef.current.status === "playing") await engine.pause();
    else await engine.play();
  }, [engine]);

  const pausePlayback = useCallback(async () => {
    await engine.pause();
  }, [engine]);

  const seek = useCallback(async (seconds: number) => {
    await engine.seek(seconds);
  }, [engine]);

  const acceptTrack = useCallback((trackId: string) => {
    setMusicState((state) => applyPreference(state, trackId, "accept"));
  }, []);
  const rejectTrack = useCallback((trackId: string) => {
    setMusicState((state) => applyPreference(state, trackId, "reject"));
  }, []);
  const restoreRejectedTrack = useCallback((trackId: string) => {
    setMusicState((state) => ({
      ...state,
      rejectedTrackIds: state.rejectedTrackIds.filter((id) => id !== trackId),
    }));
  }, []);
  const connectTidal = useCallback(async (selectedPlaylistIds: string[] = []) => {
    void selectedPlaylistIds;
    setIsAuthenticated(true);
  }, []);
  const initializeMms = useCallback((initialTrackIds: string[]) => {
    if (initialTrackIds.length > 0) {
      setMusicState((state) => ({
        ...state,
        mmsTrackIds: [...new Set([...state.mmsTrackIds, ...initialTrackIds])],
      }));
      setIsPersonalized(true);
    }
  }, []);

  const currentTrack =
    playback.currentIndex === null
      ? null
      : playback.queue[playback.currentIndex]?.track ?? null;
  const value = useMemo<MusicSession>(() => ({
    acceptTrack,
    connectTidal,
    cycleRepeatMode,
    currentIndex: playback.currentIndex,
    currentTrack,
    durationSeconds: playback.durationSeconds,
    initializeMms,
    isAuthenticated,
    isPersonalized,
    isPlaying: playback.status === "playing",
    isMuted: volume === 0,
    musicState,
    nextTrack,
    pausePlayback,
    playbackError: playback.errorCode,
    playbackPosition: playback.positionSeconds,
    playbackStatus: playback.status,
    playQueueIndex,
    playTrack,
    previousTrack,
    queue: playback.queue,
    repeatMode,
    rejectTrack,
    restoreRejectedTrack,
    seek,
    setVolume,
    setPlaybackPosition: (seconds) => void seek(seconds),
    setQueue,
    togglePlayback,
    toggleMute,
    toggleShuffle,
    shuffleEnabled,
    volume,
  }), [
    acceptTrack, connectTidal, currentTrack, cycleRepeatMode, initializeMms, isAuthenticated,
    isPersonalized, musicState, nextTrack, pausePlayback, playback, playQueueIndex, playTrack,
    previousTrack, rejectTrack, repeatMode, restoreRejectedTrack, seek, setQueue,
    setVolume, shuffleEnabled, toggleMute, togglePlayback, toggleShuffle, volume,
  ]);

  return (
    <MusicSessionContext.Provider value={value}>
      <div className="contents" data-testid="music-session-root">
        {children}
      </div>
    </MusicSessionContext.Provider>
  );
}

export function useMusicSession(): MusicSession {
  const session = useContext(MusicSessionContext);
  if (!session) {
    throw new Error("useMusicSession must be used within MusicSessionProvider");
  }
  return session;
}
