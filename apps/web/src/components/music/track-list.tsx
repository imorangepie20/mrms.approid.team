"use client";

import Image from "next/image";
import { useState } from "react";

import { LikeButton } from "@/components/music/like-button";
import { trackLikeItem } from "@/lib/likes/adapters";
import type { PlaybackStatus, Track } from "@/lib/music/types";
import type { PlaybackSource } from "@/lib/tidal/player";
import { useMusicSession } from "@/providers/music-session-provider";

type TrackListProps = {
  emptyMessage?: string;
  heading?: string;
  source: { id: string; type: PlaybackSource };
  tracks: Track[];
};

export function TrackList({
  emptyMessage = "표시할 트랙이 없습니다.",
  heading,
  source,
  tracks,
}: TrackListProps) {
  const { currentTrack, playbackStatus, playTrack, setQueue } = useMusicSession();

  const selectTrack = (track: Track) => {
    setQueue(tracks, source);
    void playTrack(track, source);
  };

  return (
    <section>
      {heading ? (
        <h2 className="dash-heading">
          {heading} <small>{tracks.length}곡</small>
        </h2>
      ) : null}
      {tracks.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <div className="overflow-hidden border-y border-[var(--border)]">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="h-11 text-[11px] font-medium tracking-[0.08em] text-[var(--subtle)]">
                <th className="w-10 px-2 text-center" scope="col">#</th>
                <th className="w-[48%] px-2" scope="col">TITLE</th>
                <th className="w-[25%] px-2" scope="col">ARTIST</th>
                <th className="hidden w-[22%] px-2 md:table-cell" scope="col">ALBUM</th>
                <th className="hidden w-16 px-2 text-right sm:table-cell" scope="col">TIME</th>
                <th className="w-12 px-0" scope="col"><span className="sr-only">좋아요</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {tracks.map((track, index) => (
                <TrackRow
                  index={index}
                  isCurrent={isSameTrack(track, currentTrack)}
                  key={track.id}
                  onPlay={selectTrack}
                  playbackStatus={playbackStatus}
                  track={track}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrackRow({
  index,
  isCurrent,
  onPlay,
  playbackStatus,
  track,
}: {
  index: number;
  isCurrent: boolean;
  onPlay: (track: Track) => void;
  playbackStatus: PlaybackStatus;
  track: Track;
}) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const duration = "durationSeconds" in track && typeof track.durationSeconds === "number"
    ? formatDuration(track.durationSeconds)
    : "—";
  const playbackUnavailable = track.playbackAvailable === false;

  return (
    <tr
      aria-current={isCurrent ? "true" : undefined}
      className={`group h-[68px] transition-colors ${playbackUnavailable ? "opacity-50" : isCurrent ? "bg-fuchsia-400/[0.08] hover:bg-fuchsia-400/[0.11]" : "hover:bg-white/[0.025]"}`}
    >
      <td className={`px-2 text-center text-sm ${isCurrent ? "text-fuchsia-300" : "text-[var(--subtle)]"}`}>
        {isCurrent ? <CurrentTrackIndicator playbackStatus={playbackStatus} /> : index + 1}
      </td>
      <td className="px-2">
        <button
          aria-label={playbackUnavailable ? `재생 불가 ${track.title}` : `재생 ${track.title}`}
          className="flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed"
          disabled={playbackUnavailable}
          type="button"
          onClick={() => onPlay(track)}
        >
          <span className={`relative size-11 shrink-0 overflow-hidden rounded-md bg-gradient-to-br ${track.artworkClass}`}>
            {track.artworkUrl && !artworkFailed ? (
              <Image
                alt={`${track.title} 앨범 아트`}
                className="object-cover"
                fill
                sizes="44px"
                src={track.artworkUrl}
                onError={() => setArtworkFailed(true)}
              />
            ) : null}
            {playbackUnavailable ? null : (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                data-testid="track-play-overlay"
              >
                <svg className="size-5 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.4v13.2a1 1 0 0 0 1.52.85l10.1-6.6a1 1 0 0 0 0-1.7l-10.1-6.6A1 1 0 0 0 8 5.4Z" />
                </svg>
              </span>
            )}
          </span>
          <span className={`truncate text-sm font-[560] ${isCurrent ? "text-fuchsia-200" : "text-[var(--foreground)]"}`}>{track.title}</span>
        </button>
      </td>
      <td className="truncate px-2 text-sm text-[var(--muted)]">{track.artist}</td>
      <td className="hidden truncate px-2 text-sm text-[var(--muted)] md:table-cell">{track.album}</td>
      <td className="hidden px-2 text-right text-sm tabular-nums text-[var(--muted)] sm:table-cell">{duration}</td>
      <td className="px-0 text-center">
        <LikeButton item={trackLikeItem(track)} />
      </td>
    </tr>
  );
}

function CurrentTrackIndicator({ playbackStatus }: { playbackStatus: PlaybackStatus }) {
  const label = playbackStatus === "playing"
    ? "현재 재생 중"
    : playbackStatus === "paused"
      ? "현재 트랙, 일시 정지"
      : "현재 트랙";

  return (
    <span aria-label={label} className="inline-grid size-6 place-items-center" role="img">
      {playbackStatus === "playing" ? (
        <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 16 16">
          <rect height="7" rx="1" width="2.5" x="2" y="7" />
          <rect height="12" rx="1" width="2.5" x="6.75" y="2" />
          <rect height="9" rx="1" width="2.5" x="11.5" y="5" />
        </svg>
      ) : (
        <svg aria-hidden="true" className="size-4" fill="currentColor" viewBox="0 0 16 16">
          <rect height="11" rx="1" width="3" x="3" y="2.5" />
          <rect height="11" rx="1" width="3" x="10" y="2.5" />
        </svg>
      )}
    </span>
  );
}

function isSameTrack(track: Track, currentTrack: Track | null) {
  if (!currentTrack) return false;
  if (track.tidalTrackId && currentTrack.tidalTrackId) {
    return track.tidalTrackId === currentTrack.tidalTrackId;
  }
  return track.id === currentTrack.id;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
