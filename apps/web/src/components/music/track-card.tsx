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
    <article className="group min-w-44 snap-start sm:min-w-52">
      <div
        className={`aspect-square rounded-2xl bg-gradient-to-br ${track.artworkClass} p-3 shadow-lg transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none`}
      >
        <div className="flex h-full items-end rounded-xl border border-white/20 bg-slate-950/10 p-3">
          <span className="text-xs font-bold tracking-[0.22em] text-white/85">
            MUSIC PIE
          </span>
        </div>
      </div>
      <h3 className="mt-3 truncate font-semibold text-white">{track.title}</h3>
      <p className="truncate text-sm text-slate-400">{track.artist}</p>
      <div className="mt-3 flex gap-2">
        <button
          aria-label={`재생 ${track.title}`}
          className="min-h-11 flex-1 rounded-xl bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
          type="button"
          onClick={() => playTrack(track)}
        >
          재생
        </button>
        <button
          aria-label={`내 취향으로 담기 ${track.title}`}
          className="min-h-11 flex-1 rounded-xl bg-fuchsia-400 px-3 text-sm font-semibold text-slate-950 transition hover:bg-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
          type="button"
          onClick={saveTrack}
        >
          담기
        </button>
      </div>
    </article>
  );
}
