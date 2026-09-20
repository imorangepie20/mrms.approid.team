"use client";

import { useState } from "react";

import { useMusicSession } from "@/providers/music-session-provider";

import { FullPlayerDialog } from "./full-player-dialog";

export function PersistentPlayer() {
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const { currentTrack, isPlaying, playTrack, playbackPosition, queue, setPlaybackPosition, togglePlayback } =
    useMusicSession();

  const selectAdjacentTrack = (offset: number) => {
    if (!currentTrack) {
      return;
    }

    const currentIndex = queue.findIndex((track) => track.id === currentTrack.id);
    const nextIndex = (currentIndex + offset + queue.length) % queue.length;
    playTrack(queue[nextIndex]);
  };

  return (
    <>
      <aside className="dashboard-player fixed inset-x-0 bottom-0 z-40 border-t text-white backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          {currentTrack ? (
            <>
              <button
                aria-label={`${currentTrack.title} 앨범 아트`}
                className={`hidden size-12 shrink-0 rounded-xl bg-gradient-to-br ${currentTrack.artworkClass} sm:block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300`}
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
              />
              <button
                aria-label={`Now playing ${currentTrack.title}`}
                className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
              >
                <span className="block truncate text-sm font-bold">{currentTrack.title}</span>
                <span className="block truncate text-xs text-slate-400">{currentTrack.artist}</span>
              </button>
              <div className="hidden flex-1 md:block">
                <input
                  aria-label="재생 위치"
                  className="w-full accent-fuchsia-400"
                  max="100"
                  min="0"
                  type="range"
                  value={playbackPosition}
                  onChange={(event) => setPlaybackPosition(Number(event.target.value))}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  aria-label="이전 트랙"
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                  type="button"
                  onClick={() => selectAdjacentTrack(-1)}
                >
                  ‹
                </button>
                <button
                  aria-label={isPlaying ? "일시 정지" : "재생"}
                  className="grid size-11 place-items-center rounded-full bg-fuchsia-400 font-black text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
                  type="button"
                  onClick={togglePlayback}
                >
                  {isPlaying ? "Ⅱ" : "▶"}
                </button>
                <button
                  aria-label="다음 트랙"
                  className="grid size-11 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                  type="button"
                  onClick={() => selectAdjacentTrack(1)}
                >
                  ›
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">트랙을 선택하면 여기에서 계속 재생할 수 있어요.</p>
          )}
        </div>
      </aside>
      {isFullPlayerOpen && currentTrack ? (
        <FullPlayerDialog
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          queue={queue}
          onClose={() => setIsFullPlayerOpen(false)}
          onSelectTrack={playTrack}
          playbackPosition={playbackPosition}
          onPlaybackPositionChange={setPlaybackPosition}
          onTogglePlayback={togglePlayback}
        />
      ) : null}
    </>
  );
}
