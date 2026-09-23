"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import { EditorialSectionRail } from "@/components/ems/editorial-section-rail";
import { TrackList } from "@/components/music/track-list";
import { LikeButton } from "@/components/music/like-button";
import { MmsLibrary, type MmsImportedPlaylist } from "@/components/music/mms-library";
import { TrackRail } from "@/components/music/track-rail";
import { trackLikeItem } from "@/lib/likes/adapters";
import { fetchEmsSections } from "@/lib/ems/client";
import type { EmsSectionsResponse } from "@/lib/ems/sections";
import type { Track } from "@/lib/music/types";
import {
  canUsePersonalization,
  type PersonalizationAccess,
} from "@/lib/auth/access-policy";
import { useMusicSession } from "@/providers/music-session-provider";

type Space = "home" | "ems" | "gms" | "mms";

const copy = {
  ems: { name: "External Music Space", code: "EMS", lead: "외부 플랫폼에서 모인 트랙과 플레이리스트 카탈로그입니다.", tone: "violet" },
  gms: { name: "Gateway Music Space", code: "GMS", lead: "AI 추천을 판단하고, 하트로 MMS 좋아요에 추가하세요.", tone: "teal" },
  mms: { name: "My Music Space", code: "MMS", lead: "당신이 쌓아 온 음악과 개인화된 취향 공간입니다.", tone: "violet" },
} as const;

export function MusicDashboard({ access, importedPlaylists = [], space, tracks: providedTracks, recommendationError = false, recommendationReady = false, profileVersion = "ems-v1" }: { access?: PersonalizationAccess; importedPlaylists?: MmsImportedPlaylist[]; space: Space; tracks?: Track[]; recommendationError?: boolean; recommendationReady?: boolean; profileVersion?: string }) {
  const { acceptTrack, playTrack, rejectTrack } = useMusicSession();
  const tracks = space === "gms" ? providedTracks ?? [] : providedTracks ?? [];

  if (space === "home") return <Home />;
  if (space === "mms") {
    if (access && !access.isAuthenticated) {
      return <section className="dashboard-page"><header className="space-title">My Music Space<small>MMS</small></header><PersonalizationGate access={access} returnTo="/mms" /></section>;
    }
    return <MmsLibrary access={access} importedPlaylists={importedPlaylists} />;
  }
  const meta = copy[space];
  const personalizationAllowed = access ? canUsePersonalization(access) : false;
  const persistDecision = (track: Track, decision: "accept" | "reject") => {
    void fetch("/api/recommendations/decisions", {
      body: JSON.stringify({
        decision,
        profileVersion,
        reasonCodes: track.recommendation?.reasonCodes ?? ["user_action"],
        scoreComponents: track.recommendation?.scoreComponents ?? {},
        sourceTrackId: track.id,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => {});
    if (decision === "accept") acceptTrack(track.id);
    else rejectTrack(track.id);
  };
  return <section className="dashboard-page"><header className="space-title">{meta.name}<small>{meta.code}</small></header><div className={`space-hero ${meta.tone === "teal" ? "gms-hero" : "ems-hero"}`}><p>{meta.name.toUpperCase()}</p><h1>{meta.code}</h1><span>{meta.lead}</span><strong>{tracks.length}<small>{space === "ems" ? "총 트랙" : "대기 중"}</small></strong></div>{space === "gms" && personalizationAllowed ? <p className="notice"><span aria-hidden="true" className="notice-mark" />싫어요로 결정한 트랙은 이 사용자에게 다시 추천되지 않으며, EMS 카탈로그에는 영향을 주지 않습니다.</p> : null}{space === "gms" && access && !personalizationAllowed ? <PersonalizationGate access={access} returnTo={`/${space}`} /> : space === "gms" ? <Gateway error={recommendationError} ready={recommendationReady} tracks={tracks} onPlay={playTrack} onAccept={(track) => persistDecision(track, "accept")} onReject={(track) => persistDecision(track, "reject")} /> : <TrackList heading="트랙 목록" source={{ id: space, type: space }} tracks={tracks} />}</section>;
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
  const [response, setResponse] = useState<EmsSectionsResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetchEmsSections(3, controller.signal)
      .then((result) => {
        setResponse(result);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState("error");
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="dashboard-page">
      <header className="space-title">Home<small>DISCOVER</small></header>
      <div className="space-hero home-hero">
        <p>MUSIC PIE</p>
        <h1>당신의 다음 장면</h1>
        <span>좋아할 음악을 발견하고 나만의 취향 지도를 만드세요.</span>
        <Link href="/ems">카탈로그 둘러보기</Link>
      </div>
      {state === "error" ? (
        <p className="empty-state">
          오늘의 편집 선곡을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : state === "loading" ? (
        <HomeEditorialSkeleton />
      ) : !response?.sections.length ? (
        <p className="empty-state">새로운 편집 선곡을 준비하고 있습니다.</p>
      ) : (
        <div>
          {response.sections.map((section) => (
            <EditorialSectionRail
              key={section.slug}
              moreHref="/ems"
              section={section}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HomeEditorialSkeleton() {
  return (
    <div aria-busy="true" aria-label="오늘의 편집 선곡을 불러오는 중" className="space-y-10">
      <span className="sr-only">오늘의 편집 선곡을 불러오는 중입니다.</span>
      {[0, 1, 2].map((item) => (
        <div className="animate-pulse" key={item}>
          <div className="h-6 w-56 rounded-md bg-[var(--surface-raised)]" />
          <div className="mt-3 h-4 w-72 max-w-full rounded bg-[var(--surface)]" />
          <div className="mt-5 h-44 rounded-[14px] bg-[var(--surface-raised)]" />
        </div>
      ))}
    </div>
  );
}
const recommendationReasonLabels: Record<string, string> = {
  fresh_release: "최근 발매",
  taste_match: "취향 일치",
};

function Gateway({ tracks, error, ready, onPlay, onAccept, onReject }: { tracks: Track[]; error: boolean; ready: boolean; onPlay: (track: Track) => void; onAccept: (track: Track) => void; onReject: (track: Track) => void }) {
  if (error) return <GatewayEmptyState variant="error" />;
  if (!ready) return <GatewayEmptyState variant="not-ready" />;
  if (!tracks.length) return <GatewayEmptyState variant="empty" />;
  return <><h2 className="dash-heading">결정 대기 중 <small>{tracks.length}곡</small></h2><TrackRail ariaLabel="GMS 추천" className="track-rail--gateway">{tracks.map((track) => { const reasons = (track.recommendation?.reasonCodes ?? []).map((code) => recommendationReasonLabels[code]).filter((label): label is string => Boolean(label)); return <article className="gateway-card gateway-card--fixed" key={track.id}><div className={`gateway-cover bg-gradient-to-br ${track.artworkClass}`}>{track.artworkUrl ? <Image alt={`${track.title} 앨범 아트`} fill sizes="238px" src={track.artworkUrl} /> : null}<button aria-label={`${track.title} 재생`} onClick={() => onPlay(track)}><span aria-hidden="true" className="play-icon" /></button></div><b>{track.title}</b><small>{track.artist} · {track.album}</small>{reasons.length ? <div aria-label="추천 이유">{reasons.map((reason) => <span key={reason}>{reason}</span>)}</div> : null}<div><button onClick={() => onAccept(track)}>추천 수락</button><button onClick={() => onReject(track)}>싫어요</button><LikeButton item={trackLikeItem(track)} /></div></article>; })}</TrackRail></>;
}

function GatewayEmptyState({ variant }: { variant: "error" | "not-ready" | "empty" }) {
  const copy = {
    error: {
      eyebrow: "GMS / RECOVERY",
      heading: "추천을 잠시 불러오지 못했어요",
      body: "개인화 추천을 준비하는 동안 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
    },
    "not-ready": {
      eyebrow: "GMS / YOUR NEXT LISTEN",
      heading: "당신을 위한 추천을 준비하고 있어요",
      body: "취향 분석이 완료되면 개인화 추천이 표시됩니다.",
      action: "취향 분석 시작하기",
      href: "/onboarding",
    },
    empty: {
      eyebrow: "GMS / FRESH PICKS",
      heading: "새로 발견할 곡을 찾고 있어요",
      body: "지금은 새로 추천할 곡이 없습니다.",
      action: "EMS 카탈로그 둘러보기",
      href: "/ems",
    },
  }[variant];

  return (
    <section
      aria-live={variant === "error" ? "assertive" : undefined}
      className={`gateway-empty-state gateway-empty-state--${variant}`}
      role={variant === "error" ? "alert" : undefined}
    >
      <div aria-hidden="true" className="gateway-empty-orbit"><span /></div>
      <div className="gateway-empty-copy">
        <p>{copy.eyebrow}</p>
        <h2>{copy.heading}</h2>
        <span>{copy.body}</span>
        {copy.href ? <Link href={copy.href}>{copy.action}</Link> : null}
      </div>
    </section>
  );
}
