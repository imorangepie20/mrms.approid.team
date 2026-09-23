"use client";

import { LikeButton } from "@/components/music/like-button";
import { trackLikeItem } from "@/lib/likes/adapters";
import type { Track } from "@/lib/music/types";
import type { QueueItem, RepeatMode } from "@/providers/music-session-provider";

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

type FullPlayerDialogProps = {
  currentTrack: Track;
  currentIndex: number | null;
  durationSeconds: number;
  isMuted: boolean;
  isPlaying: boolean;
  queue: QueueItem[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  volume: number;
  playbackPosition: number;
  onClose: () => void;
  onSelectTrack: (index: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onRepeat: () => void;
  onShuffle: () => void;
  onToggleMute: () => void;
  onTogglePlayback: () => void;
  onVolumeChange: (level: number) => void;
  onPlaybackPositionChange: (position: number) => void;
};

export function FullPlayerDialog({
  currentTrack,
  currentIndex,
  durationSeconds,
  isMuted,
  isPlaying,
  queue,
  repeatMode,
  shuffleEnabled,
  volume,
  playbackPosition,
  onClose,
  onSelectTrack,
  onNext,
  onPrevious,
  onRepeat,
  onShuffle,
  onToggleMute,
  onTogglePlayback,
  onVolumeChange,
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
        <LikeButton
          className="mt-4 border border-white/10 bg-white/5 text-slate-300 hover:bg-fuchsia-400/10 hover:text-fuchsia-300"
          item={trackLikeItem(currentTrack)}
        />
        <input
          aria-label="재생 위치"
          className="mt-8 w-full accent-fuchsia-400"
          max={durationSeconds || 0}
          min="0"
          type="range"
          value={playbackPosition}
          onChange={(event) => onPlaybackPositionChange(Number(event.target.value))}
        />
        <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-400">
          <span>{formatTime(playbackPosition)}</span>
          <span>{formatTime(durationSeconds)}</span>
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button aria-label={shuffleEnabled ? "셔플 끄기" : "셔플 켜기"} aria-pressed={shuffleEnabled} className={shuffleEnabled ? "min-h-11 rounded-full px-3 text-fuchsia-300" : "min-h-11 rounded-full px-3 text-slate-400"} type="button" onClick={onShuffle}>SHF</button>
          <button aria-label="이전 트랙" className="grid size-12 place-items-center rounded-full hover:bg-white/10" type="button" onClick={onPrevious}>‹</button>
          <button className="grid size-14 place-items-center rounded-full bg-[var(--brand)] font-black text-[#111118] transition hover:bg-[var(--brand-strong)] hover:text-white" type="button" onClick={onTogglePlayback} aria-label={isPlaying ? "일시 정지" : "재생"}>{isPlaying ? "Ⅱ" : "▶"}</button>
          <button aria-label="다음 트랙" className="grid size-12 place-items-center rounded-full hover:bg-white/10" type="button" onClick={onNext}>›</button>
          <button aria-label={repeatMode === "off" ? "반복 끔" : repeatMode === "all" ? "전체 반복" : "한 곡 반복"} className={repeatMode === "off" ? "min-h-11 rounded-full px-3 text-slate-400" : "min-h-11 rounded-full px-3 text-fuchsia-300"} type="button" onClick={onRepeat}>{repeatMode === "one" ? "R1" : "RPT"}</button>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button aria-label={isMuted ? "음소거 해제" : "음소거"} className="min-h-11 rounded-full px-3 text-xs font-bold text-slate-300 hover:bg-white/10" type="button" onClick={onToggleMute}>{isMuted ? "MUTE" : "VOL"}</button>
          <input aria-label="볼륨" className="w-full accent-fuchsia-400" max="100" min="0" type="range" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} />
        </div>
        <section className="mt-10 border-t border-white/10 pt-6" aria-labelledby="queue-title">
          <h2 id="queue-title" className="text-xl font-bold">재생 대기열</h2>
          <ul className="mt-4 space-y-2">
            {queue.map((item, index) => (
              <li key={item.referenceId}>
                <button
                  aria-current={index === currentIndex ? "true" : undefined}
                  aria-label={index === currentIndex ? `${item.track.title} 재생 중` : item.track.title}
                  className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${index === currentIndex ? "bg-fuchsia-400/10 text-fuchsia-100" : ""}`}
                  type="button"
                  onClick={() => onSelectTrack(index)}
                >
                  <span>{item.track.title}</span>
                  <span className="text-sm text-slate-400">{item.track.artist}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
