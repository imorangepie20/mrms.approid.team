"use client";

import Link from "next/link";
import Image from "next/image";

import { catalog } from "@/lib/music/fixtures";
import { getGatewayTracks } from "@/lib/music/recommendations";
import {
  canUsePersonalization,
  type PersonalizationAccess,
} from "@/lib/auth/access-policy";
import { useMusicSession } from "@/providers/music-session-provider";

type Space = "home" | "ems" | "gms" | "mms";

const copy = {
  ems: { name: "External Music Space", code: "EMS", lead: "외부 플랫폼에서 모인 트랙과 플레이리스트 카탈로그입니다.", tone: "violet" },
  gms: { name: "Gateway Music Space", code: "GMS", lead: "AI가 취향을 분석해 추천한 트랙입니다. 좋아요는 MMS로, 싫어요는 영구 제외됩니다.", tone: "teal" },
  mms: { name: "My Music Space", code: "MMS", lead: "당신이 쌓아 온 음악과 개인화된 취향 공간입니다.", tone: "violet" },
} as const;

export function MusicDashboard({ access, space }: { access?: PersonalizationAccess; space: Space }) {
  const { acceptTrack, musicState, playTrack, rejectTrack } = useMusicSession();
  const tracks = space === "gms" ? getGatewayTracks(catalog, musicState.mmsTrackIds, musicState.rejectedTrackIds) : space === "mms" ? catalog.filter((track) => musicState.mmsTrackIds.includes(track.id)) : catalog;

  if (space === "home") return <Home />;
  const meta = copy[space];
  const personalizationAllowed = access ? canUsePersonalization(access) : false;
  return <section className="dashboard-page"><header className="space-title">{meta.name}<small>{meta.code}</small></header><div className={`space-hero ${meta.tone === "teal" ? "gms-hero" : "ems-hero"}`}><p>{meta.name.toUpperCase()}</p><h1>{meta.code}</h1><span>{meta.lead}</span><strong>{tracks.length}<small>{space === "ems" ? "총 트랙" : "대기 중"}</small></strong></div>{space === "ems" ? <Filters /> : null}{space === "gms" && personalizationAllowed ? <p className="notice">★ 싫어요로 결정한 트랙은 이 사용자에게 다시 추천되지 않으며, EMS 카탈로그에는 영향을 주지 않습니다.</p> : null}{(space === "gms" || space === "mms") && access && !personalizationAllowed ? <PersonalizationGate access={access} returnTo={`/${space}`} /> : space === "gms" ? <Gateway tracks={tracks} active onPlay={playTrack} onAccept={acceptTrack} onReject={rejectTrack} /> : <TrackTable tracks={tracks} onPlay={playTrack} empty={space === "mms" ? "TIDAL 연결 후 선택한 트랙이 이곳에 표시됩니다." : "표시할 트랙이 없습니다."} />}</section>;
}

function PersonalizationGate({ access, returnTo }: { access: PersonalizationAccess; returnTo: string }) {
  if (!access.isAuthenticated) {
    return <div className="empty-state"><b>로그인이 필요합니다.</b><p>개인 음악 공간은 사용자별로 분리됩니다.</p><a href={`/api/auth/login?returnTo=${returnTo}`}>로그인하고 계속하기</a></div>;
  }

  const reconnect = access.connectionStatus === "reauthentication_required";
  const pending = access.connectionStatus === "authorization_pending";
  return <div className="empty-state"><b>{reconnect ? "TIDAL 재연결이 필요합니다." : pending ? "TIDAL 연결을 확인하고 있습니다." : "TIDAL 연결이 필요합니다."}</b><p>{reconnect ? "권한이 만료되었거나 철회되었습니다." : "플레이리스트 동의를 완료하면 개인화 기능이 열립니다."}</p><Link href="/onboarding">{reconnect ? "TIDAL 다시 연결하기" : "TIDAL 연결하기"}</Link></div>;
}

function Home() {
  const { playTrack } = useMusicSession();
  const collections = [
    { title: "새로 도착한 소리", detail: "카탈로그에 막 들어온 트랙", tracks: catalog },
    { title: "당신을 위한 다음 곡", detail: "취향 연결 전에도 가볍게 둘러볼 수 있어요", tracks: [...catalog].reverse() },
    { title: "플랫폼에서 건너온 선곡", detail: "TIDAL · Spotify · Apple Music", tracks: [catalog[1], catalog[3], catalog[0], catalog[2]] },
  ];
  const playlists = [
    { title: "Midnight Frequencies", curator: "music-pie Editorial", trackCount: 24, artworkUrl: catalog[0].artworkUrl },
    { title: "Golden Hour Drive", curator: "AI Picks · For You", trackCount: 31, artworkUrl: catalog[1].artworkUrl },
    { title: "Deep Focus", curator: "TIDAL Curated", trackCount: 42, artworkUrl: catalog[2].artworkUrl },
    { title: "Late Night R&B", curator: "AI · 개인화 추천", trackCount: 29, artworkUrl: catalog[3].artworkUrl },
  ];

  return <section className="dashboard-page"><header className="space-title">Home<small>DISCOVER</small></header><div className="space-hero home-hero"><p>MUSIC PIE</p><h1>당신의 다음 장면</h1><span>좋아할 음악을 발견하고 나만의 취향 지도를 만드세요.</span><Link href="/ems">카탈로그 둘러보기</Link></div><div className="home-summary"><span>오늘의 발견</span><b>4</b><small>새 트랙</small><Link href="/onboarding">내 음악 연결하기 →</Link></div>{collections.map((collection) => <section className="home-collection" key={collection.title}><div className="collection-heading"><div><h2 className="dash-heading">{collection.title}</h2><p>{collection.detail}</p></div><Link href="/ems">모두 보기</Link></div><div className="album-rail">{collection.tracks.map((track) => <article key={`${collection.title}-${track.id}`} className="album-card"><div className={`album-cover bg-gradient-to-br ${track.artworkClass}`}><Image alt={`${track.title} 앨범 아트`} fill sizes="185px" src={track.artworkUrl} /><button aria-label={`${track.title} 재생`} onClick={() => playTrack(track)}>▶</button></div><b>{track.title}</b><small>{track.artist}</small></article>)}</div></section>)}<section className="home-collection"><div className="collection-heading"><div><h2 className="dash-heading">지금 흐르는 플레이리스트</h2><p>새로운 플레이리스트와 취향 기반 선곡</p></div><Link href="/ems">모두 보기</Link></div><div className="album-rail">{playlists.map((playlist) => <article className="album-card playlist-card" key={playlist.title}><div className="album-cover"><Image alt={`${playlist.title} 플레이리스트 커버`} fill sizes="185px" src={playlist.artworkUrl} /></div><b>{playlist.title}</b><small>{playlist.curator}</small><span>{playlist.trackCount} tracks</span></article>)}</div></section></section>;
}
function Filters() { return <div className="filter-row"><button>전체</button><button>Tidal</button><button>Spotify</button><button>Apple Music</button><Link href="/search">⌕ 검색</Link></div>; }
function TrackTable({ tracks, onPlay, empty }: { tracks: typeof catalog; onPlay: (track: (typeof catalog)[number]) => void; empty: string }) { return <div className="track-table"><h2>트랙 목록 <small>{tracks.length}곡</small></h2>{tracks.length ? tracks.map((track, i) => <div className="track-row" key={track.id}><i>{i + 1}</i><Image alt="" className={`cover bg-gradient-to-br ${track.artworkClass}`} height={38} width={38} src={track.artworkUrl} /><b>{track.title}<small>{track.artist}</small></b><span>{track.album}</span><em>Tidal</em><button aria-label={`${track.title} 재생`} onClick={() => onPlay(track)}>▶</button></div>) : <p className="empty-state">{empty}</p>}</div>; }
function Gateway({ tracks, active, onPlay, onAccept, onReject }: { tracks: typeof catalog; active: boolean; onPlay: (track: (typeof catalog)[number]) => void; onAccept: (id: string) => void; onReject: (id: string) => void }) { if (!active) return <div className="empty-state">개인화 추천은 TIDAL 연결과 플레이리스트 분석 후 제공됩니다. <Link href="/onboarding">연결하기</Link></div>; return <><h2 className="dash-heading">결정 대기 중 <small>{tracks.length}곡</small></h2><div className="gateway-row">{tracks.map((track) => <article className="gateway-card" key={track.id}><div className={`gateway-cover bg-gradient-to-br ${track.artworkClass}`}><Image alt={`${track.title} 앨범 아트`} fill sizes="238px" src={track.artworkUrl} /><button aria-label={`${track.title} 재생`} onClick={() => onPlay(track)}>▶</button></div><b>{track.title}</b><small>{track.artist} · {track.album}</small><div><button onClick={() => onAccept(track.id)}>좋아요</button><button onClick={() => onReject(track.id)}>싫어요</button></div></article>)}</div></>; }
