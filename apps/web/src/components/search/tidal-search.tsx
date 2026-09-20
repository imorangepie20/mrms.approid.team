"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { TrackList } from "@/components/music/track-list";
import type { PlayableTrack } from "@/lib/tidal/player";
import type {
  SearchAlbum,
  SearchPlaylist,
  SearchTopHit,
  TidalSearchResult,
} from "@/lib/tidal/search";
import { useMusicSession } from "@/providers/music-session-provider";

const emptyResults: TidalSearchResult = {
  albums: [],
  next: null,
  playlists: [],
  topHits: [],
  tracks: [],
};

type ResultTab = "topHits" | "tracks" | "albums" | "playlists";

export function TidalSearch() {
  const { playTrack, setQueue } = useMusicSession();
  const [activeTab, setActiveTab] = useState<ResultTab>("topHits");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(emptyResults);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const searchRequest = fetch(
          `/api/tidal/search?q=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        const suggestionRequest = Array.from(normalized).length >= 2
          ? fetch(
              `/api/tidal/search/suggestions?q=${encodeURIComponent(normalized)}`,
              { signal: controller.signal },
            )
          : Promise.resolve(null);
        const [searchResponse, suggestionResponse] = await Promise.all([
          searchRequest,
          suggestionRequest,
        ]);
        if (!searchResponse.ok || (suggestionResponse && !suggestionResponse.ok)) {
          throw new Error("search_failed");
        }
        const [nextResults, nextSuggestions] = await Promise.all([
          searchResponse.json() as Promise<TidalSearchResult>,
          suggestionResponse
            ? suggestionResponse.json() as Promise<{ suggestions: string[] }>
            : Promise.resolve({ suggestions: [] }),
        ]);
        if (requestId !== requestIdRef.current) return;
        setResults(nextResults);
        setSuggestions(nextSuggestions.suggestions);
      } catch (requestError) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setError(
          requestError instanceof Error && requestError.message === "search_failed"
            ? "검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "검색 중 오류가 발생했습니다.",
        );
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const updateQuery = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      requestIdRef.current += 1;
      setError(null);
      setIsLoading(false);
      setResults(emptyResults);
      setSuggestions([]);
    }
  };

  const selectTrack = (track: PlayableTrack) => {
    const source = { id: `search:${query.trim()}`, type: "search" as const };
    setQueue(results.tracks, source);
    void playTrack(track, source);
  };

  const hasResults = results.tracks.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0 ||
    results.topHits.length > 0;

  return (
    <section className="w-full pb-10 pt-8 sm:py-10">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-[560] tracking-[-0.025em] text-[var(--foreground)] sm:text-3xl">듣고 싶은 음악을 바로 찾아보세요</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">트랙, 앨범, 플레이리스트를 검색하고 결과에서 바로 재생할 수 있습니다.</p>
      </header>

      <div className="relative mt-6 max-w-2xl">
        <label className="sr-only" htmlFor="tidal-search">TIDAL 음악 검색</label>
        <input
          autoComplete="off"
          className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-4 pr-14 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--subtle)] focus:border-[var(--brand)] focus:ring-3 focus:ring-purple-500/15"
          id="tidal-search"
          maxLength={200}
          placeholder="트랙, 앨범 또는 플레이리스트"
          role="searchbox"
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />
        <span aria-hidden="true" className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-xl text-slate-400">⌕</span>
        {suggestions.length > 0 && !hasResults ? (
          <div aria-label="검색어 추천" className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.34)]" role="listbox">
            {suggestions.map((suggestion) => (
              <button
                className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-[var(--muted)] hover:bg-purple-500/15 hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                key={suggestion}
                aria-selected={false}
                role="option"
                type="button"
                onClick={() => updateQuery(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <p aria-live="polite" className="sr-only">{isLoading ? "검색 중" : ""}</p>

      <div aria-label="검색 결과 종류" className="mt-8 flex gap-1 border-b border-[var(--border)]" role="tablist">
        {(["topHits", "tracks", "albums", "playlists"] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={`min-h-10 border-b px-3 text-sm font-medium ${activeTab === tab ? "border-[var(--brand)] text-[var(--brand-soft)]" : "border-transparent text-[var(--subtle)] hover:text-[var(--foreground)]"}`}
            key={tab}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {{ topHits: "통합 결과", tracks: "트랙", albums: "앨범", playlists: "플레이리스트" }[tab]}
          </button>
        ))}
      </div>

      <div className="mt-5" role="tabpanel">
        {activeTab === "topHits" ? <TopResults hits={results.topHits} onPlay={selectTrack} /> : null}
        {activeTab === "tracks" ? (
          <TrackList
            source={{ id: `search:${query.trim()}`, type: "search" }}
            tracks={results.tracks}
          />
        ) : null}
        {activeTab === "albums" ? <AlbumResults albums={results.albums} /> : null}
        {activeTab === "playlists" ? <PlaylistResults playlists={results.playlists} /> : null}
        {!isLoading && query.trim() && results[activeTab].length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-12 text-center text-sm text-[var(--subtle)]">검색 결과가 없습니다.</p>
        ) : null}
      </div>
    </section>
  );
}

function TopResults({ hits, onPlay }: { hits: SearchTopHit[]; onPlay: (track: PlayableTrack) => void }) {
  return (
    <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {hits.map((hit) => (
        <TopResultRow hit={hit} key={`${hit.kind}:${hit.id}`} onPlay={onPlay} />
      ))}
    </div>
  );
}

function TopResultRow({ hit, onPlay }: { hit: SearchTopHit; onPlay: (track: PlayableTrack) => void }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const metadata = hit.kind === "track"
    ? `트랙 · ${hit.artist}`
    : hit.kind === "album"
      ? `앨범 · ${hit.artist}`
      : `플레이리스트 · ${hit.curator} · ${hit.trackCount}곡`;
  const content = (
    <>
      <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-[#24153d] to-[#4c1d95]">
        {hit.artworkUrl && failedArtworkUrl !== hit.artworkUrl ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="56px"
            src={hit.artworkUrl}
            onError={() => setFailedArtworkUrl(hit.artworkUrl)}
          />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-[560] text-[var(--foreground)]">{hit.title}</span>
        <span className="mt-1 block truncate text-sm text-[var(--muted)]">{metadata}</span>
      </span>
    </>
  );

  return hit.kind === "track" ? (
    <button
      aria-label={`재생 ${hit.title}`}
      className="flex min-h-20 w-full items-center gap-4 px-2 py-3 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--focus-ring)]"
      type="button"
      onClick={() => onPlay(hit)}
    >
      {content}
    </button>
  ) : (
    <article className="flex min-h-20 items-center gap-4 px-2 py-3">{content}</article>
  );
}

function AlbumResults({ albums }: { albums: SearchAlbum[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{albums.map((album) => <CatalogArtworkCard artworkUrl={album.artworkUrl} key={album.id} kind="앨범" secondary={album.artist} title={album.title} />)}</div>;
}

function PlaylistResults({ playlists }: { playlists: SearchPlaylist[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{playlists.map((playlist) => <CatalogArtworkCard artworkUrl={playlist.artworkUrl} key={playlist.id} kind="플레이리스트" secondary={playlist.curator} tertiary={`${playlist.trackCount}곡`} title={playlist.title} />)}</div>;
}

function CatalogArtworkCard({ artworkUrl, kind, secondary, tertiary, title }: { artworkUrl: string; kind: "앨범" | "플레이리스트"; secondary: string; tertiary?: string; title: string }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  return <article className="min-w-0"><div className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-gradient-to-br from-[#24153d] to-[#4c1d95]">{artworkUrl && failedArtworkUrl !== artworkUrl ? <Image alt={`${title} ${kind === "앨범" ? "앨범 아트" : "플레이리스트 커버"}`} className="object-cover" fill sizes="(min-width: 1024px) 270px, 50vw" src={artworkUrl} onError={() => setFailedArtworkUrl(artworkUrl)} /> : <span className="absolute inset-0 flex items-end p-4 text-[10px] font-semibold tracking-[0.18em] text-white/80">MUSIC PIE</span>}</div><h2 className="mt-3 truncate text-[15px] font-[560] text-[var(--foreground)]">{title}</h2><p className="mt-1 truncate text-sm text-[var(--muted)]">{secondary}</p>{tertiary ? <p className="mt-1 text-xs uppercase tracking-[0.06em] text-[var(--subtle)]">{tertiary}</p> : null}</article>;
}
