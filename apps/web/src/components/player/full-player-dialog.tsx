"use client";

import type { Track } from "@/lib/music/types";

type FullPlayerDialogProps = {
  currentTrack: Track;
  isPlaying: boolean;
  queue: Track[];
  playbackPosition: number;
  onClose: () => void;
  onSelectTrack: (track: Track) => void;
  onTogglePlayback: () => void;
  onPlaybackPositionChange: (position: number) => void;
};

export function FullPlayerDialog({
  currentTrack,
  isPlaying,
  queue,
  playbackPosition,
  onClose,
  onSelectTrack,
  onTogglePlayback,
  onPlaybackPositionChange,
}: FullPlayerDialogProps) {
  return (
    <div
      aria-label="전체 화면 플레이어"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-4 text-white sm:p-8"
      role="dialog"
    >
      <div className="mx-auto max-w-2xl">
        <div className="flex justify-end">
          <button
            className="grid size-11 place-items-center rounded-full border border-white/20 text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            type="button"
            aria-label="전체 화면 플레이어 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div
          className={`mt-4 aspect-square rounded-3xl bg-gradient-to-br ${currentTrack.artworkClass} p-6 shadow-2xl`}
        >
          <div className="flex h-full items-end rounded-2xl border border-white/25 bg-slate-950/10 p-6">
            <p className="font-black tracking-[0.25em]">MUSIC PIE</p>
          </div>
        </div>
        <p className="mt-8 text-sm font-semibold tracking-[0.18em] text-fuchsia-300">
          NOW PLAYING
        </p>
        <h1 id="full-player-title" className="mt-2 text-3xl font-black sm:text-5xl">
          {currentTrack.title}
        </h1>
        <p className="mt-2 text-lg text-slate-300">{currentTrack.artist}</p>
        <input
          aria-label="재생 위치"
          className="mt-8 w-full accent-fuchsia-400"
          max="100"
          min="0"
          type="range"
          value={playbackPosition}
          onChange={(event) => onPlaybackPositionChange(Number(event.target.value))}
        />
        <button
          className="mt-6 min-h-12 rounded-xl bg-fuchsia-400 px-6 font-black text-slate-950"
          type="button"
          onClick={onTogglePlayback}
        >
          {isPlaying ? "일시 정지" : "재생"}
        </button>
        <section className="mt-10 border-t border-white/10 pt-6" aria-labelledby="queue-title">
          <h2 id="queue-title" className="text-xl font-bold">재생 대기열</h2>
          <ul className="mt-4 space-y-2">
            {queue.map((track) => (
              <li key={track.id}>
                <button
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                  type="button"
                  onClick={() => onSelectTrack(track)}
                >
                  <span>{track.title}</span>
                  <span className="text-sm text-slate-400">{track.artist}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
