"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { catalog } from "@/lib/music/fixtures";
import { applyPreference } from "@/lib/music/recommendations";
import type { MusicState, Track } from "@/lib/music/types";

type MusicSession = {
  isAuthenticated: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  musicState: MusicState;
  playTrack: (track: Track) => void;
  togglePlayback: () => void;
  acceptTrack: (trackId: string) => void;
  rejectTrack: (trackId: string) => void;
  restoreRejectedTrack: (trackId: string) => void;
  connectTidal: (selectedPlaylistIds?: string[]) => Promise<void>;
};

const MusicSessionContext = createContext<MusicSession | null>(null);

const initialMusicState: MusicState = {
  mmsTrackIds: [],
  rejectedTrackIds: [],
};

export function MusicSessionProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [musicState, setMusicState] = useState(initialMusicState);

  const playTrack = useCallback((track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  }, []);

  const togglePlayback = useCallback(() => {
    setIsPlaying((playing) => !playing);
  }, []);

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

  const value = useMemo(
    () => ({
      isAuthenticated,
      currentTrack,
      isPlaying,
      queue: catalog,
      musicState,
      playTrack,
      togglePlayback,
      acceptTrack,
      rejectTrack,
      restoreRejectedTrack,
      connectTidal,
    }),
    [
      acceptTrack,
      connectTidal,
      currentTrack,
      isAuthenticated,
      isPlaying,
      musicState,
      playTrack,
      rejectTrack,
      restoreRejectedTrack,
      togglePlayback,
    ],
  );

  return (
    <MusicSessionContext.Provider value={value}>
      {children}
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
