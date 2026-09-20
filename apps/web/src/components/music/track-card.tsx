"use client";

import Image from "next/image";
import { useState } from "react";

import { useMusicSession } from "@/providers/music-session-provider";
import type { Track } from "@/lib/music/types";

type TrackCardProps<TTrack extends Track> = {
  track: TTrack;
  onPlay?: (track: TTrack) => void;
  onRequestSignIn?: () => void;
  showSave?: boolean;
};

export function TrackCard<TTrack extends Track>({
  track,
  onPlay,
  onRequestSignIn = () => {},
  showSave = true,
}: TrackCardProps<TTrack>) {
  const { acceptTrack, isAuthenticated, playTrack } = useMusicSession();
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);

  const saveTrack = () => {
    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }

    acceptTrack(track.id);
  };

  return (
    <article className="group min-w-44 snap-start rounded-2xl border border-[var(--border)] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-w-52">
      <div className={`relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br ${track.artworkClass} shadow-lg transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none`}>
        {track.artworkUrl && failedArtworkUrl !== track.artworkUrl ? (
          <Image
            alt={`${track.title} 앨범 아트`}
            className="object-cover"
            fill
            sizes="(min-width: 640px) 208px, 176px"
            src={track.artworkUrl}
            onError={() => setFailedArtworkUrl(track.artworkUrl)}
          />
        ) : null}
        <div className="absolute inset-3 flex items-end rounded-xl border border-white/20 bg-slate-950/10 p-3">
          <span className="text-xs font-bold tracking-[0.22em] text-white/85">
            MUSIC PIE
          </span>
        </div>
      </div>
      <h3 className="mt-3 truncate font-semibold text-slate-950">{track.title}</h3>
      <p className="truncate text-sm text-slate-600">{track.artist}</p>
      <div className="mt-3 flex gap-2">
        <button
          aria-label={`재생 ${track.title}`}
          className="min-h-11 flex-1 rounded-xl bg-slate-100 px-3 text-sm font-medium text-slate-800 transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          type="button"
          onClick={() => onPlay ? onPlay(track) : void playTrack(track)}
        >
          재생
        </button>
        {showSave ? (
          <button
            aria-label={`내 취향으로 담기 ${track.title}`}
            className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            type="button"
            onClick={saveTrack}
          >
            담기
          </button>
        ) : null}
      </div>
    </article>
  );
}
