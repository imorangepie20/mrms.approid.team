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
  currentIndex: number | null;
  currentTrack: Track | null;
  durationSeconds: number;
  initializeMms: (selectedPlaylistIds: string[]) => void;
  isAuthenticated: boolean;
  isPersonalized: boolean;
  isPlaying: boolean;
  musicState: MusicState;
  nextTrack: () => Promise<void>;
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
  rejectTrack: (trackId: string) => void;
  restoreRejectedTrack: (trackId: string) => void;
  seek: (seconds: number) => Promise<void>;
  setPlaybackPosition: (seconds: number) => void;
  setQueue: (
    tracks: Track[],
    source: { id: string; type: PlaybackSource },
  ) => void;
  togglePlayback: () => Promise<void>;
};

type PlaybackAction =
  | { index: number; queue?: QueueItem[]; type: "load" }
  | { event: PlaybackEvent; type: "event" }
  | { queue: QueueItem[]; type: "queue" }
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
  return tracks.map((track) => ({
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
        const next = queue[index + 1];
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
        const nextIndex = (playbackRef.current.currentIndex ?? -1) + 1;
        if (nextIndex < playbackRef.current.queue.length) {
          void playQueueIndexRef.current(nextIndex);
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
    if (index !== null) await playQueueIndex(index + 1);
  }, [playQueueIndex]);

  const previousTrack = useCallback(async () => {
    const index = playbackRef.current.currentIndex;
    if (index !== null && index > 0) await playQueueIndex(index - 1);
  }, [playQueueIndex]);

  const togglePlayback = useCallback(async () => {
    if (playbackRef.current.status === "playing") await engine.pause();
    else await engine.play();
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
    currentIndex: playback.currentIndex,
    currentTrack,
    durationSeconds: playback.durationSeconds,
    initializeMms,
    isAuthenticated,
    isPersonalized,
    isPlaying: playback.status === "playing",
    musicState,
    nextTrack,
    playbackError: playback.errorCode,
    playbackPosition: playback.positionSeconds,
    playbackStatus: playback.status,
    playQueueIndex,
    playTrack,
    previousTrack,
    queue: playback.queue,
    rejectTrack,
    restoreRejectedTrack,
    seek,
    setPlaybackPosition: (seconds) => void seek(seconds),
    setQueue,
    togglePlayback,
  }), [
    acceptTrack, connectTidal, currentTrack, initializeMms, isAuthenticated,
    isPersonalized, musicState, nextTrack, playback, playQueueIndex, playTrack,
    previousTrack, rejectTrack, restoreRejectedTrack, seek, setQueue,
    togglePlayback,
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
