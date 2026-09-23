"use client";

import Image from "next/image";
import { useState } from "react";

import { LikeButton } from "@/components/music/like-button";
import { trackLikeItem } from "@/lib/likes/adapters";
import { useMusicSession } from "@/providers/music-session-provider";

import { FullPlayerDialog } from "./full-player-dialog";
import { TidalDeviceAuthorization } from "./tidal-device-authorization";

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function PersistentPlayer() {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const {
    currentIndex,
    currentTrack,
    cycleRepeatMode,
    durationSeconds,
    isMuted,
    isPlaying,
    nextTrack,
    playbackError,
    playbackPosition,
    playbackStatus,
    playQueueIndex,
    previousTrack,
    queue,
    repeatMode,
    seek,
    setVolume,
    shuffleEnabled,
    toggleMute,
    togglePlayback,
    toggleShuffle,
    volume,
  } = useMusicSession();
  const canPrevious = currentIndex !== null && (currentIndex > 0 || repeatMode === "all");
  const canNext = currentIndex !== null && (currentIndex < queue.length - 1 || repeatMode === "all");
  const repeatLabel = repeatMode === "off" ? "반복 끔" : repeatMode === "all" ? "전체 반복" : "한 곡 반복";
  const needsDeviceAuthorization = playbackError === "tidal_device_authorization_required" ||
    playbackError === "tidal_stream_scope_required";

  return (
    <>
      <aside aria-label="전역 음악 플레이어" className="dashboard-player fixed inset-x-0 bottom-0 z-40 border-t text-white backdrop-blur">
        <div className="flex min-h-20 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
          {currentTrack ? (
            <>
              <button
                aria-label={`${currentTrack.title} 앨범 아트`}
                className={`relative hidden size-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br ${currentTrack.artworkClass} sm:block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300`}
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
              >
                {currentTrack.artworkUrl && failedArtworkUrl !== currentTrack.artworkUrl ? (
                  <Image
                    alt={`${currentTrack.title} 앨범 아트`}
                    className="object-cover"
                    fill
                    sizes="48px"
                    src={currentTrack.artworkUrl}
                    onError={() => setFailedArtworkUrl(currentTrack.artworkUrl)}
                  />
                ) : null}
              </button>
              <button
                aria-label={`Now playing ${currentTrack.title}`}
                className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
              >
                <span className="block truncate text-sm font-bold">{currentTrack.title}</span>
                <span className="block truncate text-xs text-slate-400">{currentTrack.artist}</span>
              </button>
              <div className="hidden min-w-32 flex-1 md:block">
                <input
                  aria-label="재생 위치"
                  className="w-full accent-fuchsia-400"
                  max={durationSeconds || 0}
                  min="0"
                  type="range"
                  value={playbackPosition}
                  onChange={(event) => void seek(Number(event.target.value))}
                />
                <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
                  <span>{formatTime(playbackPosition)}</span>
                  <span>{formatTime(durationSeconds)}</span>
                </div>
              </div>
              <LikeButton
                className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-fuchsia-300"
                item={trackLikeItem(currentTrack)}
              />
              <div className="flex shrink-0 items-center gap-1">
                {needsDeviceAuthorization ? (
                  <TidalDeviceAuthorization
                    onConnected={() => {
                      if (currentIndex !== null) void playQueueIndex(currentIndex);
                    }}
                  />
                ) : null}
                <button
                  aria-label={shuffleEnabled ? "셔플 끄기" : "셔플 켜기"}
                  aria-pressed={shuffleEnabled}
                  className={`hidden size-10 place-items-center rounded-full text-xs font-bold sm:grid ${shuffleEnabled ? "text-fuchsia-300" : "text-slate-400 hover:text-white"}`}
                  type="button"
                  onClick={toggleShuffle}
                >
                  SHF
                </button>
                <button
                  aria-label="이전 트랙"
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  disabled={!canPrevious}
                  type="button"
                  onClick={() => void previousTrack()}
                >
                  ‹
                </button>
                <button
                  aria-label={isPlaying ? "일시 정지" : "재생"}
                  className="grid size-11 place-items-center rounded-full bg-[var(--brand)] font-black text-[#111118] transition hover:bg-[var(--brand-strong)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  type="button"
                  onClick={() => void togglePlayback()}
                >
                  {isPlaying ? "Ⅱ" : "▶"}
                </button>
                <button
                  aria-label="다음 트랙"
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  disabled={!canNext}
                  type="button"
                  onClick={() => void nextTrack()}
                >
                  ›
                </button>
                <button
                  aria-label={repeatLabel}
                  className={`hidden size-10 place-items-center rounded-full text-xs font-bold sm:grid ${repeatMode === "off" ? "text-slate-400 hover:text-white" : "text-fuchsia-300"}`}
                  type="button"
                  onClick={cycleRepeatMode}
                >
                  {repeatMode === "one" ? "R1" : "RPT"}
                </button>
                <div className="hidden items-center gap-2 lg:flex">
                  <button
                    aria-label={isMuted ? "음소거 해제" : "음소거"}
                    className="size-10 rounded-full text-xs font-bold text-slate-300 hover:bg-white/10"
                    type="button"
                    onClick={() => void toggleMute()}
                  >
                    {isMuted ? "MUTE" : "VOL"}
                  </button>
                  <input
                    aria-label="볼륨"
                    className="w-20 accent-fuchsia-400"
                    max="100"
                    min="0"
                    type="range"
                    value={volume}
                    onChange={(event) => void setVolume(Number(event.target.value))}
                  />
                </div>
              </div>
              {playbackStatus === "loading" || playbackStatus === "stalled" ? (
                <span role="status" className="sr-only">
                  {playbackStatus === "loading" ? "트랙을 불러오는 중" : "재생을 버퍼링하는 중"}
                </span>
              ) : null}
              {playbackError ? <span role="alert" className="sr-only">{playbackError}</span> : null}
            </>
          ) : (
            <p className="text-sm text-slate-400">트랙을 선택하면 여기에서 계속 재생할 수 있어요.</p>
          )}
        </div>
      </aside>
      {isFullPlayerOpen && currentTrack ? (
        <FullPlayerDialog
          currentTrack={currentTrack}
          currentIndex={currentIndex}
          isPlaying={isPlaying}
          isMuted={isMuted}
          durationSeconds={durationSeconds}
          queue={queue}
          repeatMode={repeatMode}
          shuffleEnabled={shuffleEnabled}
          volume={volume}
          onClose={() => setIsFullPlayerOpen(false)}
          onSelectTrack={(index) => void playQueueIndex(index)}
          playbackPosition={playbackPosition}
          onPlaybackPositionChange={(seconds) => void seek(seconds)}
          onNext={() => void nextTrack()}
          onPrevious={() => void previousTrack()}
          onRepeat={cycleRepeatMode}
          onShuffle={toggleShuffle}
          onToggleMute={() => void toggleMute()}
          onTogglePlayback={() => void togglePlayback()}
          onVolumeChange={(level) => void setVolume(level)}
        />
      ) : null}
    </>
  );
}
