"use client";

import Image from "next/image";
import { useState } from "react";

import { LikeButton } from "@/components/music/like-button";
import { trackLikeItem } from "@/lib/likes/adapters";
import type { Track } from "@/lib/music/types";
import type { QueueItem, RepeatMode } from "@/providers/music-session-provider";

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function QueueArtwork({ track }: { track: Track }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);

  return (
    <span aria-hidden="true" className={`full-player-queue-artwork bg-gradient-to-br ${track.artworkClass}`}>
      {track.artworkUrl && failedArtworkUrl !== track.artworkUrl ? (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="44px"
          src={track.artworkUrl}
          onError={() => setFailedArtworkUrl(track.artworkUrl)}
        />
      ) : <span>♪</span>}
    </span>
  );
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
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const hasArtwork = Boolean(currentTrack.artworkUrl) && failedArtworkUrl !== currentTrack.artworkUrl;

  return (
    <div
      aria-label="전체 화면 플레이어"
      aria-modal="true"
      className="full-player-dialog fixed inset-0 z-50 overflow-y-auto text-white"
      role="dialog"
    >
      <div className="full-player-shell">
        <header className="full-player-header">
          <div>
            <span className="full-player-wordmark">MUSIC PIE PLAYER</span>
            <p>전체 플레이어</p>
          </div>
          <button
            className="full-player-close grid size-11 place-items-center rounded-full text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            type="button"
            aria-label="전체 화면 플레이어 닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="full-player-stage">
          <div className="full-player-artwork-card">
            <div className={`full-player-artwork relative overflow-hidden bg-gradient-to-br ${currentTrack.artworkClass}`}>
              {hasArtwork ? (
                <Image
                  alt={`${currentTrack.title} 앨범 아트`}
                  className="object-cover"
                  fill
                  sizes="(min-width: 900px) 440px, (min-width: 640px) 55vw, 72vw"
                  src={currentTrack.artworkUrl}
                  onError={() => setFailedArtworkUrl(currentTrack.artworkUrl)}
                />
              ) : (
                <p className="full-player-artwork-fallback">MUSIC PIE</p>
              )}
            </div>
            <div className="full-player-artwork-caption">
              <span>지금 듣는 음악</span>
              <strong>{currentIndex === null ? "—" : String(currentIndex + 1).padStart(2, "0")} / {String(queue.length).padStart(2, "0")}</strong>
            </div>
          </div>

          <section className="full-player-now" aria-labelledby="full-player-title">
            <div className="full-player-status"><span aria-hidden="true" />{isPlaying ? "지금 재생 중" : "재생 일시 정지"}</div>
            <div className="full-player-track-heading">
              <div>
                <h1 id="full-player-title">{currentTrack.title}</h1>
                <p>{currentTrack.artist}</p>
                {currentTrack.album ? <small>{currentTrack.album}</small> : null}
              </div>
              <LikeButton
                className="full-player-like border border-white/10 bg-white/5 text-slate-300 hover:bg-fuchsia-400/10 hover:text-fuchsia-300"
                item={trackLikeItem(currentTrack)}
              />
            </div>
            <div className="full-player-controls">
              <input
                aria-label="재생 위치"
                className="full-player-range w-full accent-fuchsia-400"
                max={durationSeconds || 0}
                min="0"
                type="range"
                value={playbackPosition}
                onChange={(event) => onPlaybackPositionChange(Number(event.target.value))}
              />
              <div className="full-player-times">
                <span>{formatTime(playbackPosition)}</span>
                <span>{formatTime(durationSeconds)}</span>
              </div>
              <div className="full-player-buttons">
                <button aria-label={shuffleEnabled ? "셔플 끄기" : "셔플 켜기"} aria-pressed={shuffleEnabled} className={shuffleEnabled ? "min-h-11 rounded-full px-3 text-fuchsia-300" : "min-h-11 rounded-full px-3 text-slate-400"} type="button" onClick={onShuffle}>SHF</button>
                <button aria-label="이전 트랙" className="grid size-12 place-items-center rounded-full hover:bg-white/10" type="button" onClick={onPrevious}>‹</button>
                <button className="grid size-14 place-items-center rounded-full bg-[var(--brand)] font-black text-[#111118] transition hover:bg-[var(--brand-strong)] hover:text-white" type="button" onClick={onTogglePlayback} aria-label={isPlaying ? "일시 정지" : "재생"}>{isPlaying ? "Ⅱ" : "▶"}</button>
                <button aria-label="다음 트랙" className="grid size-12 place-items-center rounded-full hover:bg-white/10" type="button" onClick={onNext}>›</button>
                <button aria-label={repeatMode === "off" ? "반복 끔" : repeatMode === "all" ? "전체 반복" : "한 곡 반복"} className={repeatMode === "off" ? "min-h-11 rounded-full px-3 text-slate-400" : "min-h-11 rounded-full px-3 text-fuchsia-300"} type="button" onClick={onRepeat}>{repeatMode === "one" ? "R1" : "RPT"}</button>
              </div>
              <div className="full-player-volume">
                <button aria-label={isMuted ? "음소거 해제" : "음소거"} className="min-h-11 rounded-full px-3 text-xs font-bold text-slate-300 hover:bg-white/10" type="button" onClick={onToggleMute}>{isMuted ? "MUTE" : "VOL"}</button>
                <input aria-label="볼륨" className="full-player-range w-full accent-fuchsia-400" max="100" min="0" type="range" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} />
              </div>
            </div>
          </section>
        </div>

        <section className="full-player-queue" aria-labelledby="queue-title">
          <div className="full-player-queue-heading">
            <h2 id="queue-title">재생 대기열</h2>
            <span>{queue.length}곡</span>
          </div>
          <ul>
            {queue.map((item, index) => (
              <li key={item.referenceId}>
                <button
                  aria-current={index === currentIndex ? "true" : undefined}
                  aria-label={index === currentIndex ? `${item.track.title} 재생 중` : item.track.title}
                  aria-description={[item.track.artist, item.track.album,
                    typeof item.track.durationSeconds === "number" && Number.isFinite(item.track.durationSeconds) && item.track.durationSeconds > 0
                      ? formatTime(item.track.durationSeconds) : null].filter(Boolean).join(", ")}
                  className="full-player-queue-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  type="button"
                  onClick={() => onSelectTrack(index)}
                >
                  <span className="full-player-queue-number">{String(index + 1).padStart(2, "0")}</span>
                  <QueueArtwork track={item.track} />
                  <span className="full-player-queue-track">
                    <strong>{item.track.title}</strong>
                    <small>{item.track.artist}</small>
                    {item.track.album ? <small className="full-player-queue-album">{item.track.album}</small> : null}
                  </span>
                  <span className="full-player-queue-meta">
                    {index === currentIndex ? <span className="full-player-queue-current">재생 중</span> : null}
                    {typeof item.track.durationSeconds === "number" && Number.isFinite(item.track.durationSeconds) && item.track.durationSeconds > 0
                      ? <span className="full-player-queue-duration">{formatTime(item.track.durationSeconds)}</span>
                      : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
