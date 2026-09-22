"use client";

import Link from "next/link";

import { TrackCard } from "@/components/music/track-card";
import type { EmsEditorialSection } from "@/lib/ems/sections";
import type { Track } from "@/lib/music/types";
import { useMusicSession } from "@/providers/music-session-provider";

export function EditorialSectionRail({
  moreHref,
  section,
}: {
  moreHref?: string;
  section: EmsEditorialSection;
}) {
  const { playTrack, setQueue } = useMusicSession();
  const headingId = `editorial-${section.slug}`;

  const playSectionTrack = (track: Track) => {
    const source = { id: section.slug, type: "ems" as const };
    setQueue(section.tracks, source);
    void playTrack(track, source);
  };

  return (
    <section aria-labelledby={headingId} className="mt-12 first:mt-0">
      <div className="mb-5 flex items-end justify-between gap-5">
        <div className="min-w-0">
          <h2
            className="text-xl font-[650] tracking-[-0.025em] text-[var(--foreground)] sm:text-2xl"
            id={headingId}
          >
            {section.title}
          </h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-6 text-[var(--muted)]">
            {section.description}
          </p>
        </div>
        {moreHref ? (
          <Link
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--brand-soft)] underline-offset-4 transition-colors hover:bg-purple-500/10 hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            href={moreHref}
          >
            EMS에서 더 보기
            <svg
              aria-hidden="true"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        ) : null}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {section.tracks.map((track) => (
          <TrackCard
            key={track.id}
            showSave={false}
            track={track}
            onPlay={playSectionTrack}
          />
        ))}
      </div>
    </section>
  );
}
