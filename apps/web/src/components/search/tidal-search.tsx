"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { TrackCard } from "@/components/music/track-card";
import type { PlayableTrack } from "@/lib/tidal/player";
import type {
  SearchAlbum,
  SearchArtist,
  TidalSearchResult,
} from "@/lib/tidal/search";
import { useMusicSession } from "@/providers/music-session-provider";

const emptyResults: TidalSearchResult = {
  albums: [],
  artists: [],
  next: null,
  tracks: [],
};

type ResultTab = "tracks" | "albums" | "artists";

export function TidalSearch() {
  const { playTrack, setQueue } = useMusicSession();
  const [activeTab, setActiveTab] = useState<ResultTab>("tracks");
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

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-700">TIDAL CATALOG</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">듣고 싶은 음악을 바로 찾아보세요</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">트랙, 앨범, 아티스트를 검색하고 결과에서 바로 재생할 수 있습니다.</p>
      </header>

      <div className="relative mt-7 max-w-2xl">
        <label className="sr-only" htmlFor="tidal-search">TIDAL 음악 검색</label>
        <input
          autoComplete="off"
          className="min-h-14 w-full rounded-2xl border border-slate-300 bg-white px-5 pr-16 text-base text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          id="tidal-search"
          maxLength={200}
          placeholder="곡, 앨범 또는 아티스트"
          role="searchbox"
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
        />
        <span aria-hidden="true" className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-xl text-slate-400">⌕</span>
        {suggestions.length > 0 ? (
          <div aria-label="검색어 추천" className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" role="listbox">
            {suggestions.map((suggestion) => (
              <button
                className="block min-h-11 w-full rounded-xl px-3 text-left text-sm text-slate-700 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-500"
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

      <div aria-label="검색 결과 종류" className="mt-9 flex gap-2 border-b border-slate-200" role="tablist">
        {(["tracks", "albums", "artists"] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${activeTab === tab ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
            key={tab}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {{ tracks: "트랙", albums: "앨범", artists: "아티스트" }[tab]}
          </button>
        ))}
      </div>

      <div className="mt-6" role="tabpanel">
        {activeTab === "tracks" ? <TrackResults tracks={results.tracks} onPlay={selectTrack} /> : null}
        {activeTab === "albums" ? <AlbumResults albums={results.albums} /> : null}
        {activeTab === "artists" ? <ArtistResults artists={results.artists} /> : null}
        {!isLoading && query.trim() && results[activeTab].length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center text-sm text-slate-500">검색 결과가 없습니다.</p>
        ) : null}
      </div>
    </section>
  );
}

function TrackResults({ tracks, onPlay }: { tracks: PlayableTrack[]; onPlay: (track: PlayableTrack) => void }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{tracks.map((track) => <TrackCard key={track.id} onPlay={onPlay} showSave={false} track={track} />)}</div>;
}

function AlbumResults({ albums }: { albums: SearchAlbum[] }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{albums.map((album) => <AlbumCard album={album} key={album.id} />)}</div>;
}

function AlbumCard({ album }: { album: SearchAlbum }) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-sky-500">{album.artworkUrl && failedArtworkUrl !== album.artworkUrl ? <Image alt={`${album.title} 앨범 아트`} className="object-cover" fill sizes="(min-width: 1024px) 256px, 50vw" src={album.artworkUrl} onError={() => setFailedArtworkUrl(album.artworkUrl)} /> : <span className="absolute inset-0 flex items-end p-4 text-xs font-bold tracking-[0.2em] text-white/85">MUSIC PIE</span>}</div><h2 className="mt-3 truncate font-semibold text-slate-950">{album.title}</h2><p className="mt-1 truncate text-sm text-slate-600">{album.artist}</p></article>;
}

function ArtistResults({ artists }: { artists: SearchArtist[] }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{artists.map((artist) => <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm" key={artist.id}><h2 className="font-semibold text-slate-950">{artist.name}</h2></article>)}</div>;
}
