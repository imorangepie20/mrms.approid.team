"use client";

import Image from "next/image";
import { useState } from "react";

import type { Track } from "@/lib/music/types";
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
  const { playTrack, setQueue } = useMusicSession();

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
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {tracks.map((track, index) => (
                <TrackRow
                  index={index}
                  key={track.id}
                  onPlay={selectTrack}
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
  onPlay,
  track,
}: {
  index: number;
  onPlay: (track: Track) => void;
  track: Track;
}) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const duration = "durationSeconds" in track && typeof track.durationSeconds === "number"
    ? formatDuration(track.durationSeconds)
    : "—";

  return (
    <tr className="group h-[68px] transition-colors hover:bg-white/[0.025]">
      <td className="px-2 text-center text-sm text-[var(--subtle)]">{index + 1}</td>
      <td className="px-2">
        <button
          aria-label={`재생 ${track.title}`}
          className="flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
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
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              data-testid="track-play-overlay"
            >
              <svg className="size-5 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.4v13.2a1 1 0 0 0 1.52.85l10.1-6.6a1 1 0 0 0 0-1.7l-10.1-6.6A1 1 0 0 0 8 5.4Z" />
              </svg>
            </span>
          </span>
          <span className="truncate text-sm font-[560] text-[var(--foreground)]">{track.title}</span>
        </button>
      </td>
      <td className="truncate px-2 text-sm text-[var(--muted)]">{track.artist}</td>
      <td className="hidden truncate px-2 text-sm text-[var(--muted)] md:table-cell">{track.album}</td>
      <td className="hidden px-2 text-right text-sm tabular-nums text-[var(--muted)] sm:table-cell">{duration}</td>
    </tr>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
