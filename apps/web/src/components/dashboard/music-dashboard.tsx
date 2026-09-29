"use client";

import Link from "next/link";
import Image from "next/image";
import { ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HomeShaderHero } from "@/components/dashboard/home-shader-hero";
import { EditorialSectionRail } from "@/components/ems/editorial-section-rail";
import { AddToPlaylistButton } from "@/components/music/add-to-playlist-button";
import { TrackList } from "@/components/music/track-list";
import { LikeButton } from "@/components/music/like-button";
import { MmsLibrary, type MmsImportedPlaylist } from "@/components/music/mms-library";
import { PlayIcon } from "@/components/music/play-icon";
import { trackLikeItem } from "@/lib/likes/adapters";
import { fetchEmsSections } from "@/lib/ems/client";
import type { EmsSectionsResponse } from "@/lib/ems/sections";
import type { HomeContent } from "@/lib/home/content";
import type { MmsPlaylistSummary } from "@/lib/mms/playlists";
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

export function MusicDashboard({
  access,
  importedPlaylists = [],
  mmsPlaylists = [],
  profileVersion = "ems-v1",
  recommendationBatchId = null,
  recommendationError = false,
  recommendationExhausted = false,
  recommendationReady = false,
  space,
  tracks: providedTracks,
}: {
  access?: PersonalizationAccess;
  importedPlaylists?: MmsImportedPlaylist[];
  mmsPlaylists?: MmsPlaylistSummary[];
  profileVersion?: string;
  recommendationBatchId?: string | null;
  recommendationError?: boolean;
  recommendationExhausted?: boolean;
  recommendationReady?: boolean;
  space: Space;
  tracks?: Track[];
}) {
  const { acceptTrack, playTrack, rejectTrack, setQueue } = useMusicSession();
  const tracks = space === "gms" ? providedTracks ?? [] : providedTracks ?? [];

  if (space === "home") return <Home />;
  if (space === "mms") {
    if (access && !access.isAuthenticated) {
      return <section className="dashboard-page"><header className="space-title">My Music Space<small>MMS</small></header><PersonalizationGate access={access} returnTo="/mms" /></section>;
    }
    return <MmsLibrary access={access} importedPlaylists={importedPlaylists} mmsPlaylists={mmsPlaylists} />;
  }
  const meta = copy[space];
  const personalizationAllowed = access ? canUsePersonalization(access) : false;
  const persistDecision = (track: Track, decision: "accept" | "reject") => {
    void fetch("/api/recommendations/decisions", {
      body: JSON.stringify({
        decision,
        profileVersion,
        rankingVersion: track.recommendation?.rankingVersion ?? "baseline",
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
  const playGmsTrack = (track: Track) => {
    const source = { id: "gms", type: "gms" as const };
    setQueue(tracks, source);
    void playTrack(track, source);
  };
  return <section className="dashboard-page"><header className="space-title">{meta.name}<small>{meta.code}</small></header><div className={`space-hero ${meta.tone === "teal" ? "gms-hero" : "ems-hero"}`}><p>{meta.name.toUpperCase()}</p><h1>{meta.code}</h1><span>{meta.lead}</span><strong>{tracks.length}<small>{space === "ems" ? "총 트랙" : "대기 중"}</small></strong></div>{space === "gms" && personalizationAllowed ? <><p className="notice"><span aria-hidden="true" className="notice-mark" />한 번 추천된 트랙은 이 사용자에게 다시 추천되지 않으며, EMS 카탈로그에는 영향을 주지 않습니다.</p><div className="gms-profile-tools"><AudioProfileRefreshControl /><Link href="/gms/history">추천 이력 보기 <span aria-hidden="true">→</span></Link></div></> : null}{space === "gms" && access && !personalizationAllowed ? <PersonalizationGate access={access} returnTo={`/${space}`} /> : space === "gms" ? <Gateway batchId={recommendationBatchId} error={recommendationError} exhausted={recommendationExhausted} ready={recommendationReady} tracks={tracks} onPlay={playGmsTrack} onAccept={(track) => persistDecision(track, "accept")} onReject={(track) => persistDecision(track, "reject")} /> : <TrackList heading="트랙 목록" source={{ id: space, type: space }} tracks={tracks} />}</section>;
}

type AudioProfileRefreshResponse = {
  analyzedTrackCount: number;
  coverageRatio: number;
  created: boolean;
  eligibleTrackCount: number;
};

function AudioProfileRefreshControl() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [summary, setSummary] = useState("");

  const refresh = async () => {
    setState("loading");
    setSummary("");
    try {
      const response = await fetch("/api/recommendations/audio-profile", { method: "POST" });
      if (!response.ok) throw new Error("audio_profile_refresh_failed");
      const result = await response.json() as AudioProfileRefreshResponse;
      setSummary(result.created
        ? `${result.analyzedTrackCount}/${result.eligibleTrackCount}곡 반영 완료`
        : "분석이 완료된 곡을 기다리고 있어요");
      setState("success");
    } catch {
      setSummary("오디오 취향을 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setState("error");
    }
  };

  return (
    <div className="gms-audio-profile-control">
      <div>
        <b>오디오 취향 프로필</b>
        <span aria-live="polite">{summary || "분석된 곡의 사운드를 추천에 반영합니다."}</span>
      </div>
      <button disabled={state === "loading"} type="button" onClick={refresh}>
        {state === "loading" ? "반영 중…" : "오디오 취향 반영"}
      </button>
    </div>
  );
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
      {hero ? <HomeShaderHero hero={hero} /> : null}
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
function Gateway({ batchId, tracks, error, exhausted, ready, onPlay, onAccept, onReject }: { batchId: string | null; tracks: Track[]; error: boolean; exhausted: boolean; ready: boolean; onPlay: (track: Track) => void; onAccept: (track: Track) => void; onReject: (track: Track) => void }) {
  const router = useRouter();
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle");

  const refreshRecommendations = async () => {
    if (!batchId || exhausted || refreshState === "loading") return;
    setRefreshState("loading");
    try {
      const response = await fetch("/api/recommendations/refresh", {
        body: JSON.stringify({ currentBatchId: batchId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("recommendation_refresh_failed");
      router.refresh();
      setRefreshState("idle");
    } catch {
      setRefreshState("error");
    }
  };

  if (error) return <GatewayEmptyState variant="error" />;
  if (!ready) return <GatewayEmptyState variant="not-ready" />;
  return (
    <section aria-labelledby="gms-track-list-title" className="gms-track-list-section">
      <div className="gms-recommendation-heading">
        <h2 className="dash-heading" id="gms-track-list-title">결정 대기 중 <small>{tracks.length}곡</small></h2>
        <div className="gms-refresh-control">
          <button disabled={!batchId || exhausted || refreshState === "loading"} type="button" onClick={refreshRecommendations}>
            {refreshState === "loading" ? "추천 중…" : exhausted ? "추천 완료" : "다시 추천 받기"}
          </button>
          {!exhausted ? <small>새 추천을 받으면 현재 곡들은 다시 추천되지 않습니다.</small> : null}
          {refreshState === "error" ? <span role="alert">새 추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</span> : null}
        </div>
      </div>
      {exhausted ? <GatewayEmptyState variant="exhausted" /> : !tracks.length ? <GatewayEmptyState variant="empty" /> : <>
        <div aria-hidden="true" className="gms-track-list-header">
          <span>#</span><span>곡</span><span>아티스트</span><span>앨범</span><span>결정</span>
        </div>
        <ol aria-label="GMS 트랙 추천" className="gms-track-list">
          {tracks.map((track, index) => (
            <GatewayTrackRow
              index={index}
              key={track.id}
              onAccept={onAccept}
              onPlay={onPlay}
              onReject={onReject}
              track={track}
            />
          ))}
        </ol>
      </>}
    </section>
  );
}

function GatewayTrackRow({ index, track, onPlay, onAccept, onReject }: { index: number; track: Track; onPlay: (track: Track) => void; onAccept: (track: Track) => void; onReject: (track: Track) => void }) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const playbackUnavailable = track.playbackAvailable === false;

  return (
    <li className={`gms-track-row ${playbackUnavailable ? "gms-track-row--unavailable" : ""}`}>
      <span aria-hidden="true" className="gms-track-number">{String(index + 1).padStart(2, "0")}</span>
      <button
        aria-label={playbackUnavailable ? `재생 불가 ${track.title}` : `재생 ${track.title}`}
        className="gms-track-main"
        disabled={playbackUnavailable}
        type="button"
        onClick={() => onPlay(track)}
      >
        <span className={`gms-track-artwork bg-gradient-to-br ${track.artworkClass}`}>
          {track.artworkUrl && !artworkFailed ? <Image alt="" fill sizes="48px" src={track.artworkUrl} onError={() => setArtworkFailed(true)} /> : null}
          {playbackUnavailable ? null : <span aria-hidden="true" className="gms-track-play"><PlayIcon /></span>}
        </span>
        <span className="gms-track-copy"><b>{track.title}</b><small>{track.artist} · {track.album}</small></span>
      </button>
      <span className="gms-track-artist">{track.artist}</span>
      <span className="gms-track-album">{track.album}</span>
      <div className="gms-track-actions">
        <button className="gms-decision-button gms-decision-button--accept" type="button" onClick={() => onAccept(track)}>+ MMS</button>
        <button aria-label="싫어요" className="gms-decision-button gms-decision-button--icon" title="싫어요" type="button" onClick={() => onReject(track)}><ThumbsDown aria-hidden="true" /></button>
        <AddToPlaylistButton track={track} />
        <LikeButton item={trackLikeItem(track)} />
      </div>
    </li>
  );
}

function GatewayEmptyState({ variant }: { variant: "error" | "not-ready" | "empty" | "exhausted" }) {
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
    exhausted: {
      eyebrow: "GMS / COMPLETE",
      heading: "모든 추천 후보를 확인했습니다",
      body: "한 번 보여드린 곡은 다시 추천하지 않습니다. 추천 후보가 모두 소진되어 더 이상 새로운 추천을 만들 수 없습니다.",
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
