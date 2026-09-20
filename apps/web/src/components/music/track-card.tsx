"use client";

import { useMusicSession } from "@/providers/music-session-provider";
import type { Track } from "@/lib/music/types";

type TrackCardProps = {
  track: Track;
  onRequestSignIn: () => void;
};

export function TrackCard({ track, onRequestSignIn }: TrackCardProps) {
  const { acceptTrack, isAuthenticated, playTrack } = useMusicSession();

  const saveTrack = () => {
    if (!isAuthenticated) {
      onRequestSignIn();
      return;
    }

    acceptTrack(track.id);
  };

  return (
    <article className="group min-w-44 snap-start rounded-2xl border border-[var(--border)] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:min-w-52">
      <div
        className={`aspect-square rounded-2xl bg-gradient-to-br ${track.artworkClass} p-3 shadow-lg transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none`}
      >
        <div className="flex h-full items-end rounded-xl border border-white/20 bg-slate-950/10 p-3">
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
          onClick={() => playTrack(track)}
        >
          재생
        </button>
        <button
          aria-label={`내 취향으로 담기 ${track.title}`}
          className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          type="button"
          onClick={saveTrack}
        >
          담기
        </button>
      </div>
    </article>
  );
}
