"use client";

import { useEffect, useState } from "react";

import { EditorialSectionRail } from "@/components/ems/editorial-section-rail";
import { TrackList } from "@/components/music/track-list";
import { fetchEmsSections } from "@/lib/ems/client";
import type { EmsSectionsResponse } from "@/lib/ems/sections";
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
    fetchEmsSections(5, controller.signal)
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
  if (!response?.sections.length) {
    return <p className="empty-state">새로운 편집 선곡을 준비하고 있습니다.</p>;
  }
  return (
    <div>
      {response.sections.map((section) => (
        <EditorialSectionRail key={section.slug} section={section} />
      ))}
    </div>
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
