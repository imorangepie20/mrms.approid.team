"use client";
import { useState } from "react";
import { TrackList } from "@/components/music/track-list";
import { filterCatalogTracks } from "@/lib/music/catalog";
import { catalog } from "@/lib/music/fixtures";
export function EmsBrowser({ autoFocus = false }: { autoFocus?: boolean }) { const [query, setQuery] = useState(""); const tracks = filterCatalogTracks(catalog, { query }); return <section className="dashboard-page"><header className="space-title">External Music Space <small>EMS</small></header><div className="space-hero ems-hero"><p>EXTERNAL MUSIC SPACE</p><h1>EMS</h1><span>외부 플랫폼에서 모인 트랙과 플레이리스트 카탈로그입니다.</span><strong>{tracks.length}<small>총 트랙</small></strong></div><div className="filter-row"><button>전체</button><button>Tidal</button><button>Spotify</button><button>Apple Music</button><input autoFocus={autoFocus} aria-label="카탈로그 검색" placeholder="검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div><TrackList heading="트랙 목록" source={{ id: "ems", type: "ems" }} tracks={tracks} /></section>; }
