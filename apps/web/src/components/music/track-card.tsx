"use client";

import Image from "next/image";
import { useState } from "react";

import { LikeButton } from "@/components/music/like-button";
import { PlayIcon } from "@/components/music/play-icon";
import { trackLikeItem } from "@/lib/likes/adapters";
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
    <article className="track-card group min-w-44 snap-start rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-colors hover:border-purple-400/30 sm:min-w-52">
      <div className={`group/artwork relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br ${track.artworkClass}`}>
        {track.artworkUrl && failedArtworkUrl !== track.artworkUrl ? (
          <Image
            alt={`${track.title} 앨범 아트`}
            className="object-cover"
            fill
            sizes="(min-width: 640px) 208px, 176px"
            src={track.artworkUrl}
            onError={() => setFailedArtworkUrl(track.artworkUrl)}
          />
        ) : (
          <span className="absolute inset-0 flex items-end p-4 text-[10px] font-semibold tracking-[0.18em] text-white/80">
            MUSIC PIE
          </span>
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-[background-color,opacity] duration-200 group-hover/artwork:bg-black/45 group-hover/artwork:opacity-100 group-focus-within/artwork:bg-black/45 group-focus-within/artwork:opacity-100 [@media(hover:none)]:bg-black/20 [@media(hover:none)]:opacity-100">
          <button
            aria-label={`재생 ${track.title}`}
            className="pointer-events-none grid size-10 translate-y-1 scale-95 place-items-center rounded-full bg-[rgba(76,29,149,0.82)] text-white ring-1 ring-[rgba(46,16,101,0.95)] shadow-[0_8px_24px_rgba(0,0,0,0.42)] transition duration-200 group-hover/artwork:pointer-events-auto group-hover/artwork:translate-y-0 group-hover/artwork:scale-100 group-focus-within/artwork:pointer-events-auto group-focus-within/artwork:translate-y-0 group-focus-within/artwork:scale-100 hover:bg-[rgba(109,40,217,0.88)] focus-visible:pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transform-none [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:scale-100"
            type="button"
            onClick={() => onPlay ? onPlay(track) : void playTrack(track)}
          >
            <PlayIcon className="ml-0.5 size-4" />
          </button>
        </div>
      </div>
      <h3 className="mt-3 truncate text-[15px] font-semibold tracking-[-0.015em] text-[var(--foreground)]">{track.title}</h3>
      <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{track.artist}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        {showSave ? (
          <button
            aria-label={`내 취향으로 담기 ${track.title}`}
            className="min-h-9 rounded-lg bg-[var(--surface-hover)] px-3 text-xs font-medium text-[var(--foreground)] transition hover:bg-purple-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            type="button"
            onClick={saveTrack}
          >
            담기
          </button>
        ) : null}
        <LikeButton item={trackLikeItem(track)} />
      </div>
    </article>
  );
}
