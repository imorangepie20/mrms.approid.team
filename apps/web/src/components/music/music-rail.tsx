import type { Track } from "@/lib/music/types";

import { TrackCard } from "./track-card";

type MusicRailProps = {
  title: string;
  description: string;
  tracks: Track[];
  onRequestSignIn: () => void;
};

export function MusicRail({
  title,
  description,
  tracks,
  onRequestSignIn,
}: MusicRailProps) {
  return (
    <section aria-labelledby={`${title}-heading`} className="mt-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id={`${title}-heading`} className="text-xl font-bold text-white sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <button
          className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-fuchsia-300 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
          type="button"
        >
          모두 보기
        </button>
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {tracks.map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            onRequestSignIn={onRequestSignIn}
          />
        ))}
      </div>
    </section>
  );
}
