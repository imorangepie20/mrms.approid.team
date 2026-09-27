"use client";

import { ExternalLink } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { EditorialSectionRail } from "@/components/ems/editorial-section-rail";
import { TrackList } from "@/components/music/track-list";
import { fetchEmsSections } from "@/lib/ems/client";
import type { EmsSectionsResponse } from "@/lib/ems/sections";
import type { EmsSpotifyPlaylist } from "@/lib/ems/sections";
import type { Track } from "@/lib/music/types";

type LoadState = "loading" | "ready" | "error";
type SearchState = "idle" | LoadState;

export function EmsBrowser({ autoFocus = false }: { autoFocus?: boolean }) {
  const [sectionsResponse, setSectionsResponse] =
    useState<EmsSectionsResponse | null>(null);
  const [sectionState, setSectionState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [searchTracks, setSearchTracks] = useState<Track[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [resolvedSearchQuery, setResolvedSearchQuery] = useState("");
  const normalizedQuery = query.trim();

  useEffect(() => {
    const controller = new AbortController();
    fetchEmsSections("ems", 5, controller.signal)
      .then((response) => {
        setSectionsResponse(response);
        setSectionState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSectionState("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!normalizedQuery) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setResolvedSearchQuery(normalizedQuery);
      setSearchState("loading");
      const params = new URLSearchParams({
        limit: "100",
        query: normalizedQuery,
        region: "KR",
        sort: "new",
      });
      fetch(`/api/ems/catalog?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("ems_catalog_failed");
          const body = (await response.json()) as { tracks?: Track[] };
          setSearchTracks(Array.isArray(body.tracks) ? body.tracks : []);
          setSearchState("ready");
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setSearchTracks([]);
          setSearchState("error");
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery]);

  return (
    <section className="dashboard-page">
      <header className="space-title">
        External Music Space <small>EMS</small>
      </header>
      <div className="space-hero ems-hero">
        <p>EXTERNAL MUSIC SPACE</p>
        <h1>EMS</h1>
        <span>외부 플랫폼에서 모인 트랙과 플레이리스트 카탈로그입니다.</span>
        <strong>
          {sectionsResponse?.totalCount ?? 0}
          <small>총 트랙</small>
        </strong>
      </div>
      <div className="mb-9 flex justify-end">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">카탈로그 검색</span>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--subtle)]"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            aria-label="카탈로그 검색"
            autoFocus={autoFocus}
            className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] pl-11 pr-4 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--subtle)] focus:border-[var(--brand)] focus:ring-3 focus:ring-purple-500/15"
            placeholder="제목이나 아티스트 검색"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {normalizedQuery ? (
        <SearchResults
          query={normalizedQuery}
          state={
            resolvedSearchQuery === normalizedQuery ? searchState : "loading"
          }
          tracks={searchTracks}
        />
      ) : (
        <EditorialSections response={sectionsResponse} state={sectionState} />
      )}
    </section>
  );
}

function EditorialSections({
  response,
  state,
}: {
  response: EmsSectionsResponse | null;
  state: LoadState;
}) {
  if (state === "error") {
    return (
      <p className="empty-state">
        편집 선곡을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  if (state === "loading") return <SectionSkeleton />;
  const editorialSections = response?.sections ?? [];
  const spotifyPlaylists = response?.spotifyPlaylists ?? [];
  if (!editorialSections.length && !spotifyPlaylists.length) {
    return <p className="empty-state">새로운 편집 선곡을 준비하고 있습니다.</p>;
  }
  return (
    <div>
      {spotifyPlaylists.length ? (
        <SpotifyChartSection playlists={spotifyPlaylists} />
      ) : null}
      {editorialSections.map((section) => (
        <EditorialSectionRail key={section.slug} section={section} />
      ))}
    </div>
  );
}

function SpotifyChartSection({ playlists }: { playlists: EmsSpotifyPlaylist[] }) {
  const [selectedId, setSelectedId] = useState(playlists[0]?.spotifyId ?? "");
  const selected = playlists.find((playlist) => playlist.spotifyId === selectedId) ?? playlists[0];

  return (
    <section aria-labelledby="spotify-chart-heading" className="mb-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-[650] text-[var(--foreground)] sm:text-2xl" id="spotify-chart-heading">
            Spotify 차트
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Spotify 공개 차트에서 수집해 TIDAL 재생 가능 여부를 확인한 곡입니다.
          </p>
        </div>
        <a
          aria-label="Spotify 추천 차트 원문 열기"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          href="https://open.spotify.com/section/0JQ5DAzQHECxDlYNI6xD1g"
          rel="noopener noreferrer"
          target="_blank"
          title="Spotify 추천 차트 원문"
        >
          <ExternalLink aria-hidden="true" size={18} />
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {playlists.map((playlist) => {
          const selected = playlist.spotifyId === selectedId;
          return (
            <button
              aria-pressed={selected}
              className={`group flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                selected
                  ? "border-[var(--brand)] bg-purple-500/10"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]"
              }`}
              key={playlist.spotifyId}
              type="button"
              onClick={() => setSelectedId(playlist.spotifyId)}
            >
              <span className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-md bg-[var(--surface-raised)]">
                {playlist.artworkUrl ? (
                  <Image
                    alt=""
                    className="object-cover"
                    fill
                    sizes="80px"
                    src={playlist.artworkUrl}
                  />
                ) : null}
              </span>
              <span className="min-w-0">
                <strong className="block text-sm font-semibold text-[var(--foreground)]">
                  {playlist.title}
                </strong>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {playlist.matchedCount} / {playlist.sourceTrackCount}곡
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="mt-8">
          <TrackList
            emptyMessage="TIDAL에서 재생 가능한 곡을 확인하고 있습니다."
            heading={selected.title}
            source={{ id: `spotify:${selected.spotifyId}`, type: "ems" }}
            tracks={selected.tracks}
          />
        </div>
      ) : null}
    </section>
  );
}

function SearchResults({
  query,
  state,
  tracks,
}: {
  query: string;
  state: SearchState;
  tracks: Track[];
}) {
  if (state === "error") {
    return (
      <p className="empty-state">
        검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  if (state === "loading" || state === "idle") return <SectionSkeleton />;
  if (!tracks.length) {
    return (
      <p className="empty-state">
        검색 결과가 없습니다. 다른 제목이나 아티스트를 입력해 보세요.
      </p>
    );
  }
  return (
    <TrackList
      heading={`“${query}” 검색 결과`}
      source={{ id: "ems-search", type: "ems" }}
      tracks={tracks}
    />
  );
}

function SectionSkeleton() {
  return (
    <div aria-busy="true" aria-label="편집 선곡을 불러오는 중" className="space-y-10">
      <span className="sr-only">편집 선곡을 불러오는 중입니다.</span>
      {[0, 1].map((item) => (
        <div className="animate-pulse" key={item}>
          <div className="h-6 w-52 rounded-md bg-[var(--surface-raised)]" />
          <div className="mt-3 h-4 w-72 max-w-full rounded bg-[var(--surface)]" />
          <div className="mt-5 flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((card) => (
              <div
                className="aspect-square min-w-44 rounded-[14px] bg-[var(--surface-raised)] sm:min-w-52"
                key={card}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
