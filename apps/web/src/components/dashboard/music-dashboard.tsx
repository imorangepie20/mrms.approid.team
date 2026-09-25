"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import { EditorialSectionRail } from "@/components/ems/editorial-section-rail";
import { TrackList } from "@/components/music/track-list";
import { LikeButton } from "@/components/music/like-button";
import { MmsLibrary, type MmsImportedPlaylist } from "@/components/music/mms-library";
import { PlayIcon } from "@/components/music/play-icon";
import { TrackRail } from "@/components/music/track-rail";
import { trackLikeItem } from "@/lib/likes/adapters";
import { fetchEmsSections } from "@/lib/ems/client";
import type { EmsSectionsResponse } from "@/lib/ems/sections";
import type { HomeContent } from "@/lib/home/content";
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
  const [content, setContent] = useState<HomeContent[]>([]);
  const [contentError, setContentError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchEmsSections("home", 3, controller.signal)
      .then((result) => {
        setResponse(result);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState("error");
      });
    fetch("/api/home/content", { signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error("home_content_unavailable");
        setContent(await result.json() as HomeContent[]);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setContentError(true);
      });
    return () => controller.abort();
  }, []);

  const hero = content.find((item) => item.kind === "hero");
  const concept = content.find((item) => item.kind === "concept");
  const guides = content.filter((item) => item.kind === "guide");
  const stories = content.filter((item) => item.kind === "story");

  return (
    <section className="dashboard-page">
      <header className="space-title">Home<small>DISCOVER</small></header>
      {hero ? <section className="home-feature" aria-labelledby="home-feature-title">
        <div className="home-feature-copy">
          <p className="home-wordmark">MUSIC PIE</p>
          <h1 id="home-feature-title">{hero.title}</h1>
          <p>{hero.body}</p>
          {hero.linkHref ? <Link className="home-action" href={hero.linkHref}>{hero.linkLabel}</Link> : null}
        </div>
        <div className="home-feature-art" aria-hidden="true"><div className="home-disc"><div /></div><span>DISCOVER<br />YOUR SOUND</span></div>
      </section> : null}
      {concept ? <section className="home-concept" aria-labelledby="home-concept-title">
        <div><h2 id="home-concept-title">{concept.title}</h2><p>{concept.body}</p></div>
        {concept.linkHref ? <Link href={concept.linkHref}>{concept.linkLabel} <span aria-hidden="true">↗</span></Link> : null}
      </section> : null}
      {guides.length ? <section className="home-guides" aria-labelledby="home-guides-title">
        <div className="home-section-heading"><h2 id="home-guides-title">Music Pie 이용법</h2><p>플레이리스트 하나에서 시작해 내 음악 공간까지.</p></div>
        <div className="home-guide-grid">{guides.map((guide, index) => <article className="home-guide" key={guide.id}>
          <span className="home-guide-number">{String(index + 1).padStart(2, "0")}</span><h3>{guide.title}</h3><p>{guide.body}</p>
          {guide.linkHref ? <Link href={guide.linkHref}>{guide.linkLabel} <span aria-hidden="true">↗</span></Link> : null}
        </article>)}</div>
      </section> : null}
      {contentError ? <p className="empty-state">메인 콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
      <div className="home-section-heading home-picks-heading"><h2>지금 발견할 음악</h2><p>EMS 카탈로그에서 고른 실제 트랙을 들어보세요.</p></div>
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
      {stories.length ? <section className="home-stories" aria-labelledby="home-stories-title">
        <div className="home-section-heading"><h2 id="home-stories-title">음악을 즐기는 이야기</h2><p>듣고, 발견하고, 내 것으로 만드는 방법.</p></div>
        <div className="home-story-grid">{stories.map((story) => <article className="home-story" key={story.id}>
          <div className="home-story-mark" aria-hidden="true" /><h3>{story.title}</h3><p>{story.body}</p>
          {story.linkHref ? <Link href={story.linkHref}>{story.linkLabel} <span aria-hidden="true">↗</span></Link> : null}
        </article>)}</div>
      </section> : null}
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
function Gateway({ tracks, error, ready, onPlay, onAccept, onReject }: { tracks: Track[]; error: boolean; ready: boolean; onPlay: (track: Track) => void; onAccept: (track: Track) => void; onReject: (track: Track) => void }) {
  if (error) return <GatewayEmptyState variant="error" />;
  if (!ready) return <GatewayEmptyState variant="not-ready" />;
  if (!tracks.length) return <GatewayEmptyState variant="empty" />;
  return <><h2 className="dash-heading">결정 대기 중 <small>{tracks.length}곡</small></h2><TrackRail ariaLabel="GMS 추천" className="track-rail--gateway">{tracks.map((track) => <article className="gateway-card gateway-card--fixed" key={track.id}><div className={`gateway-cover bg-gradient-to-br ${track.artworkClass}`}>{track.artworkUrl ? <Image alt={`${track.title} 앨범 아트`} fill sizes="238px" src={track.artworkUrl} /> : null}<div className="track-card-play-overlay"><button className="track-card-play-button cover-play-button grid size-10 place-items-center rounded-full bg-[rgba(76,29,149,0.82)] text-white ring-1 ring-[rgba(46,16,101,0.95)] shadow-[0_8px_24px_rgba(0,0,0,0.42)] transition duration-200 hover:bg-[rgba(109,40,217,0.88)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transform-none" aria-label={`${track.title} 재생`} onClick={() => onPlay(track)}><PlayIcon /></button></div></div><b>{track.title}</b><small>{track.artist} · {track.album}</small><div><button onClick={() => onAccept(track)}>추천 수락</button><button onClick={() => onReject(track)}>싫어요</button><LikeButton item={trackLikeItem(track)} /></div></article>)}</TrackRail></>;
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
