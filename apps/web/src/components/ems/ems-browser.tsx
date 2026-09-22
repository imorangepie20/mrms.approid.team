"use client";
import { useEffect, useState } from "react";
import { TrackList } from "@/components/music/track-list";

import type { Track } from "@/lib/music/types";

export function EmsBrowser({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ limit: "100", region: "KR", sort: "new" });
    if (query.trim()) params.set("query", query.trim());
    fetch(`/api/ems/catalog?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("ems_catalog_failed");
        const body = (await response.json()) as { tracks?: Track[] };
        setTracks(Array.isArray(body.tracks) ? body.tracks : []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(true);
        setTracks([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  return <section className="dashboard-page"><header className="space-title">External Music Space <small>EMS</small></header><div className="space-hero ems-hero"><p>EXTERNAL MUSIC SPACE</p><h1>EMS</h1><span>외부 플랫폼에서 모인 트랙과 플레이리스트 카탈로그입니다.</span><strong>{tracks.length}<small>총 트랙</small></strong></div><div className="filter-row"><button>전체</button><button>Tidal</button><button>Spotify</button><button>Apple Music</button><input autoFocus={autoFocus} aria-label="카탈로그 검색" placeholder="검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div>{error ? <p className="empty-state">카탈로그를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : loading ? <p className="empty-state">카탈로그를 불러오는 중입니다.</p> : <TrackList heading="트랙 목록" source={{ id: "ems", type: "ems" }} tracks={tracks} />}</section>;
}
