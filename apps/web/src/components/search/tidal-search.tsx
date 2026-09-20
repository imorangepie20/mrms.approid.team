"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { TrackList } from "@/components/music/track-list";
import { TidalEmbedDialog } from "@/components/player/tidal-embed-dialog";
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
type CatalogSelection = {
  artworkUrl: string;
  id: string;
  kind: "album" | "playlist";
  secondary: string;
  title: string;
  trackCount?: number;
};
type CatalogDetail = CatalogSelection & {
  error: string | null;
  status: "loading" | "ready" | "error";
  tracks: PlayableTrack[];
};

export function TidalSearch() {
  const { pausePlayback, playTrack, setQueue } = useMusicSession();
  const [activeTab, setActiveTab] = useState<ResultTab>("topHits");
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(emptyResults);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tidalEmbed, setTidalEmbed] = useState<CatalogSelection | null>(null);
  const requestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);
  const detailHistoryEntryRef = useRef(false);

  useEffect(() => {
    const closeFromHistory = () => {
      detailRequestIdRef.current += 1;
      detailHistoryEntryRef.current = false;
      setDetail(null);
    };
    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, []);

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

  const loadDetail = useCallback(async (
    selection: CatalogSelection,
    pushHistory: boolean,
  ) => {
    const requestId = ++detailRequestIdRef.current;
    setDetail({ ...selection, error: null, status: "loading", tracks: [] });
    if (pushHistory) {
      window.history.pushState({ tidalCatalogDetail: true }, "");
      detailHistoryEntryRef.current = true;
    }
    try {
      const response = await fetch(
        `/api/tidal/catalog?type=${selection.kind}&id=${encodeURIComponent(selection.id)}`,
      );
      if (!response.ok) throw new Error("catalog_failed");
      const body = await response.json() as { tracks: PlayableTrack[] };
      if (requestId !== detailRequestIdRef.current) return;
      setDetail({ ...selection, error: null, status: "ready", tracks: body.tracks });
    } catch {
      if (requestId !== detailRequestIdRef.current) return;
      setDetail({
        ...selection,
        error: "트랙을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        status: "error",
        tracks: [],
      });
    }
  }, []);

  const openDetail = (selection: CatalogSelection) => {
    void loadDetail(selection, true);
  };

  const closeDetail = () => {
    detailRequestIdRef.current += 1;
    setDetail(null);
    if (detailHistoryEntryRef.current) {
      detailHistoryEntryRef.current = false;
      window.history.back();
    }
  };

  const hasResults = results.tracks.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0 ||
    results.topHits.length > 0;

  if (detail) {
    return (
      <>
        <CatalogDetailPanel
          detail={detail}
          onBack={closeDetail}
          onOpenTidal={() => {
            void pausePlayback().catch(() => undefined);
            setTidalEmbed(detail);
          }}
          onRetry={() => void loadDetail(detail, false)}
          onPlay={(tracks) => {
            const first = tracks[0];
            if (!first) return;
            const source = { id: `${detail.kind}:${detail.id}`, type: "search" as const };
            setQueue(tracks, source);
            void playTrack(first, source);
          }}
        />
        {tidalEmbed ? (
          <TidalEmbedDialog
            kind={tidalEmbed.kind}
            resourceId={tidalEmbed.id}
            title={tidalEmbed.title}
            onClose={() => setTidalEmbed(null)}
          />
        ) : null}
      </>
    );
  }

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
        {activeTab === "topHits" ? <TopResults hits={results.topHits} onOpen={openDetail} onPlay={selectTrack} /> : null}
        {activeTab === "tracks" ? (
          <TrackList
            source={{ id: `search:${query.trim()}`, type: "search" }}
            tracks={results.tracks}
          />
        ) : null}
        {activeTab === "albums" ? <AlbumResults albums={results.albums} onOpen={openDetail} /> : null}
        {activeTab === "playlists" ? <PlaylistResults onOpen={openDetail} playlists={results.playlists} /> : null}
        {!isLoading && query.trim() && results[activeTab].length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-12 text-center text-sm text-[var(--subtle)]">검색 결과가 없습니다.</p>
        ) : null}
      </div>
    </section>
  );
}

function TopResults({ hits, onOpen, onPlay }: { hits: SearchTopHit[]; onOpen: (selection: CatalogSelection) => void; onPlay: (track: PlayableTrack) => void }) {
  return (
    <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {hits.map((hit) => (
        <TopResultRow hit={hit} key={`${hit.kind}:${hit.id}`} onOpen={onOpen} onPlay={onPlay} />
      ))}
    </div>
  );
}

function TopResultRow({ hit, onOpen, onPlay }: { hit: SearchTopHit; onOpen: (selection: CatalogSelection) => void; onPlay: (track: PlayableTrack) => void }) {
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
    <button
      aria-label={`${hit.kind === "album" ? "앨범" : "플레이리스트"} ${hit.title} 열기`}
      className="flex min-h-20 w-full items-center gap-4 px-2 py-3 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--focus-ring)]"
      type="button"
      onClick={() => onOpen({
        artworkUrl: hit.artworkUrl,
        id: hit.id,
        kind: hit.kind,
        secondary: hit.kind === "album" ? hit.artist : hit.curator,
        title: hit.title,
        trackCount: hit.kind === "playlist" ? hit.trackCount : undefined,
      })}
    >{content}</button>
  );
}

function AlbumResults({ albums, onOpen }: { albums: SearchAlbum[]; onOpen: (selection: CatalogSelection) => void }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{albums.map((album) => <CatalogArtworkCard artworkUrl={album.artworkUrl} id={album.id} key={album.id} kind="album" onOpen={onOpen} secondary={album.artist} title={album.title} />)}</div>;
}

function PlaylistResults({ onOpen, playlists }: { onOpen: (selection: CatalogSelection) => void; playlists: SearchPlaylist[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{playlists.map((playlist) => <CatalogArtworkCard artworkUrl={playlist.artworkUrl} id={playlist.id} key={playlist.id} kind="playlist" onOpen={onOpen} secondary={playlist.curator} tertiary={`${playlist.trackCount}곡`} title={playlist.title} trackCount={playlist.trackCount} />)}</div>;
}

function CatalogArtworkCard({ artworkUrl, id, kind, onOpen, secondary, tertiary, title, trackCount }: CatalogSelection & { onOpen: (selection: CatalogSelection) => void; tertiary?: string }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const kindLabel = kind === "album" ? "앨범" : "플레이리스트";
  return <button aria-label={`${kindLabel} ${title} 열기`} className="group min-w-0 text-left" type="button" onClick={() => onOpen({ artworkUrl, id, kind, secondary, title, trackCount })}><span className="relative block aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-gradient-to-br from-[#24153d] to-[#4c1d95] transition duration-200 group-hover:border-purple-400/40 group-hover:brightness-110 group-focus-visible:outline-2 group-focus-visible:outline-offset-3 group-focus-visible:outline-[var(--focus-ring)]">{artworkUrl && failedArtworkUrl !== artworkUrl ? <Image alt={`${title} ${kind === "album" ? "앨범 아트" : "플레이리스트 커버"}`} className="object-cover transition-transform duration-200 group-hover:scale-[1.02]" fill sizes="(min-width: 1024px) 270px, 50vw" src={artworkUrl} onError={() => setFailedArtworkUrl(artworkUrl)} /> : <span className="absolute inset-0 flex items-end p-4 text-[10px] font-semibold tracking-[0.18em] text-white/80">MUSIC PIE</span>}</span><span className="mt-3 block truncate text-[15px] font-[560] text-[var(--foreground)]">{title}</span><span className="mt-1 block truncate text-sm text-[var(--muted)]">{secondary}</span>{tertiary ? <span className="mt-1 block text-xs uppercase tracking-[0.06em] text-[var(--subtle)]">{tertiary}</span> : null}</button>;
}

function CatalogDetailPanel({ detail, onBack, onOpenTidal, onPlay, onRetry }: { detail: CatalogDetail; onBack: () => void; onOpenTidal: () => void; onPlay: (tracks: PlayableTrack[]) => void; onRetry: () => void }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const shuffleAndPlay = () => {
    const shuffled = [...detail.tracks];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    onPlay(shuffled);
  };

  return (
    <section className="w-full pb-10 pt-6 sm:py-8">
      <button className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" type="button" onClick={onBack}>
        <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
        검색 결과로 돌아가기
      </button>

      <header className="mt-5 grid gap-6 border-b border-[var(--border)] pb-8 sm:grid-cols-[minmax(180px,240px)_1fr] sm:items-end">
        <div className="relative aspect-square w-full max-w-60 overflow-hidden rounded-xl bg-gradient-to-br from-[#24153d] to-[#4c1d95]">
          {detail.artworkUrl && failedArtworkUrl !== detail.artworkUrl ? <Image alt="" className="object-cover" fill priority sizes="(max-width: 640px) 240px, 240px" src={detail.artworkUrl} onError={() => setFailedArtworkUrl(detail.artworkUrl)} /> : null}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted)]">{detail.kind === "album" ? "앨범" : "플레이리스트"} · TIDAL</p>
          <h1 className="mt-2 text-3xl font-[620] tracking-[-0.035em] text-[var(--foreground)] sm:text-4xl">{detail.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{detail.secondary}{detail.status === "ready" ? ` · ${detail.tracks.length}곡` : detail.trackCount ? ` · ${detail.trackCount}곡` : ""}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="min-h-11 rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white enabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40" disabled={detail.status !== "ready" || detail.tracks.length === 0} type="button" onClick={() => onPlay(detail.tracks)}>
              전체 재생
            </button>
            <button className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-5 text-sm font-semibold text-[var(--muted)] enabled:hover:text-[var(--foreground)] disabled:cursor-default disabled:opacity-40" disabled={detail.status !== "ready" || detail.tracks.length === 0} type="button" onClick={shuffleAndPlay}>
              셔플
            </button>
            <button className="min-h-11 rounded-lg border border-cyan-300/30 bg-cyan-300/[0.06] px-5 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/[0.12]" type="button" onClick={onOpenTidal}>
              TIDAL 전체 재생
            </button>
          </div>
        </div>
      </header>

      <div className="mt-7">
        {detail.status === "loading" ? <div aria-label="트랙 불러오는 중" className="space-y-2" role="status">{[0, 1, 2, 3].map((row) => <div className="h-[68px] animate-pulse rounded-lg bg-white/[0.035]" key={row} />)}</div> : null}
        {detail.status === "error" ? <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] px-5 py-6" role="alert"><p className="m-0 text-sm text-red-200">{detail.error}</p><button className="mt-4 min-h-10 rounded-lg border border-red-300/25 px-4 text-sm font-semibold text-red-100" type="button" onClick={onRetry}>다시 시도</button></div> : null}
        {detail.status === "ready" ? <TrackList emptyMessage="표시할 트랙이 없습니다." source={{ id: `${detail.kind}:${detail.id}`, type: "search" }} tracks={detail.tracks} /> : null}
      </div>
    </section>
  );
}
