"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { LikeButton } from "@/components/music/like-button";
import { TrackList } from "@/components/music/track-list";
import type { PersonalizationAccess } from "@/lib/auth/access-policy";
import type { LikeItem, LikeKey, LikeSnapshot } from "@/lib/likes/types";
import type { Track } from "@/lib/music/types";
import { useLikes } from "@/providers/likes-provider";
import { useMusicSession } from "@/providers/music-session-provider";

type CatalogDetail = {
  error: string | null;
  item: LikeKey & LikeSnapshot;
  origin: "imported" | "liked";
  sourceId: string;
  status: "loading" | "ready" | "error";
  tracks: Track[];
};

export type MmsImportedPlaylist = {
  artworkUrl: string | null;
  id: string;
  name: string;
  tidalPlaylistId: string;
  tracks: Track[];
};

function sameLike(left: LikeKey, right: LikeKey) {
  return left.entityType === right.entityType &&
    left.source === right.source &&
    left.sourceId === right.sourceId;
}

function importedPlaylistLikeItem(playlist: MmsImportedPlaylist): LikeKey & LikeSnapshot {
  return {
    artworkUrl: playlist.artworkUrl ?? "",
    entityType: "playlist",
    metadata: { trackCount: playlist.tracks.length },
    source: "tidal",
    sourceId: playlist.tidalPlaylistId,
    subtitle: `${playlist.tracks.length}곡`,
    title: playlist.name,
  };
}

function likedTrackToTrack(item: LikeItem): Track {
  const album = typeof item.metadata.album === "string" ? item.metadata.album : "Unknown Album";
  const durationSeconds = typeof item.metadata.durationSeconds === "number"
    ? item.metadata.durationSeconds
    : null;
  const playbackAvailable = typeof item.metadata.playbackAvailable === "boolean"
    ? item.metadata.playbackAvailable
    : true;
  return {
    album,
    artist: item.subtitle || "Unknown Artist",
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    artworkUrl: item.artworkUrl,
    durationSeconds,
    id: item.source === "tidal" ? `liked-track:${item.sourceId}` : item.sourceId,
    playbackAvailable,
    tidalTrackId: item.source === "tidal" ? item.sourceId : undefined,
    title: item.title,
  };
}

export function MmsLibrary({ access, importedPlaylists = [] }: { access?: PersonalizationAccess; importedPlaylists?: MmsImportedPlaylist[] }) {
  const { items } = useLikes();
  const { playTrack, setQueue } = useMusicSession();
  const [selectedDetail, setDetail] = useState<CatalogDetail | null>(null);
  const tracks = items.filter((item) => item.entityType === "track").map(likedTrackToTrack);
  const playlists = items.filter((item) => item.entityType === "playlist");
  const albums = items.filter((item) => item.entityType === "album");
  const artists = items.filter((item) => item.entityType === "artist");

  const detail = selectedDetail && (
    selectedDetail.origin === "imported" || items.some((item) => sameLike(item, selectedDetail.item))
  )
    ? selectedDetail
    : null;

  const playTracks = (queue: Track[], sourceId = "liked-tracks") => {
    const first = queue[0];
    if (!first) return;
    const source = { id: sourceId, type: "mms" as const };
    setQueue(queue, source);
    void playTrack(first, source);
  };

  const playShuffled = (queue: Track[], sourceId: string) => {
    const shuffled = [...queue];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    playTracks(shuffled, sourceId);
  };

  const openDetail = async (item: LikeKey & LikeSnapshot) => {
    if (item.source !== "tidal" || (item.entityType !== "album" && item.entityType !== "playlist")) return;
    const sourceId = `liked-${item.entityType}:${item.sourceId}`;
    setDetail({ error: null, item, origin: "liked", sourceId, status: "loading", tracks: [] });
    try {
      const response = await fetch(`/api/tidal/catalog?type=${item.entityType}&id=${encodeURIComponent(item.sourceId)}`);
      if (!response.ok) throw new Error("catalog_failed");
      const body = await response.json() as { tracks: Track[] };
      setDetail({ error: null, item, origin: "liked", sourceId, status: "ready", tracks: body.tracks });
    } catch {
      setDetail({
        error: "트랙을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        item,
        origin: "liked",
        sourceId,
        status: "error",
        tracks: [],
      });
    }
  };

  const openImportedPlaylist = (playlist: MmsImportedPlaylist) => {
    setDetail({
      error: null,
      item: importedPlaylistLikeItem(playlist),
      origin: "imported",
      sourceId: `imported-playlist:${playlist.id}`,
      status: "ready",
      tracks: playlist.tracks,
    });
  };

  if (detail) {
    const sourceId = detail.sourceId;
    return (
      <section className="dashboard-page mms-page">
        <header className="space-title mms-page-title"><span className="mms-title-long">My Music Space</span><span className="mms-title-short">MMS</span><small>MMS</small></header>
        <section className="w-full pb-10 pt-6 sm:py-8">
          <button aria-label="MMS 목록으로 돌아가기" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]" type="button" onClick={() => setDetail(null)}>← MMS 목록으로 돌아가기</button>
          <header className="mt-5 grid gap-6 border-b border-[var(--border)] pb-8 sm:grid-cols-[minmax(180px,240px)_1fr] sm:items-end">
            <Artwork item={detail.item} large />
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted)]">{detail.origin === "imported" ? "가져온 플레이리스트" : `좋아요한 ${detail.item.entityType === "album" ? "앨범" : "플레이리스트"}`} · TIDAL</p>
              <h1 className="mt-2 text-3xl font-[620] tracking-[-0.035em] text-[var(--foreground)] sm:text-4xl">{detail.item.title}</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">{detail.origin === "imported" ? `${detail.tracks.length}곡` : `${detail.item.subtitle}${detail.status === "ready" ? ` · ${detail.tracks.length}곡` : ""}`}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button className="min-h-11 rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-40" disabled={detail.status !== "ready" || detail.tracks.length === 0} type="button" onClick={() => playTracks(detail.tracks, sourceId)}>전체 재생</button>
                <button className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-5 text-sm font-semibold text-[var(--muted)] disabled:opacity-40" disabled={detail.status !== "ready" || detail.tracks.length === 0} type="button" onClick={() => playShuffled(detail.tracks, sourceId)}>셔플</button>
                <LikeButton item={detail.item} />
              </div>
            </div>
          </header>
          <div className="mt-7">
            {detail.status === "loading" ? <p role="status">트랙을 불러오는 중입니다.</p> : null}
            {detail.status === "error" ? <div role="alert"><p>{detail.error}</p><button type="button" onClick={() => void openDetail(detail.item)}>다시 시도</button></div> : null}
            {detail.status === "ready" ? <TrackList source={{ id: sourceId, type: "mms" }} tracks={detail.tracks} /> : null}
          </div>
        </section>
      </section>
    );
  }

  const disconnected = access && access.connectionStatus !== "connected";
  return (
    <section className="dashboard-page mms-page">
      <header className="space-title mms-page-title"><span className="mms-title-long">My Music Space</span><span className="mms-title-short">MMS</span><small>MMS</small></header>
      <section className="mms-overview" aria-labelledby="mms-title">
        <div>
          <p>PERSONAL MUSIC LIBRARY</p>
          <h1 id="mms-title">My Music Space</h1>
          <span>가져온 플레이리스트와 좋아요한 음악을 한곳에서 관리하세요.</span>
        </div>
        <dl data-testid="like-summaries">
          <div><dt>좋아요한 트랙</dt><dd data-testid="liked-track-count">{tracks.length}</dd></div>
          <div><dt>좋아요한 플레이리스트</dt><dd>{playlists.length}</dd></div>
          <div><dt>좋아요한 앨범</dt><dd>{albums.length}</dd></div>
          <div><dt>좋아요한 아티스트</dt><dd>{artists.length}</dd></div>
        </dl>
      </section>

      {disconnected ? <div className="mms-connection-notice"><span>좋아요는 그대로 유지됩니다.</span><Link href="/onboarding">TIDAL 연결하기</Link></div> : null}

      <LikedSection count={importedPlaylists.length} title="가져온 플레이리스트">
        {importedPlaylists.length ? (
          <div className="mms-playlist-grid">
            {importedPlaylists.map((playlist) => {
              const likeItem = importedPlaylistLikeItem(playlist);
              return <article className="mms-playlist-card relative" key={playlist.id}>
                <button aria-label={`가져온 플레이리스트 ${playlist.name} 열기`} className="w-full text-left" type="button" onClick={() => openImportedPlaylist(playlist)}>
                  <Artwork item={likeItem} />
                  <h3>{playlist.name}</h3>
                  <p>TIDAL · {playlist.tracks.length}곡</p>
                </button>
                <LikeButton className="absolute right-3 top-3 bg-black/60 text-white" item={likeItem} />
              </article>;
            })}
          </div>
        ) : <EmptyState label="가져온 플레이리스트" />}
      </LikedSection>
      <LikedSection count={tracks.length} title="좋아요한 트랙">
        {tracks.length ? <TrackList source={{ id: "liked-tracks", type: "mms" }} tracks={tracks} /> : <EmptyState label="좋아요한 트랙" />}
      </LikedSection>
      <LikedSection count={playlists.length} title="좋아요한 플레이리스트">
        {playlists.length ? <LikeGrid items={playlists} onOpen={openDetail} /> : <EmptyState label="좋아요한 플레이리스트" />}
      </LikedSection>
      <LikedSection count={albums.length} title="좋아요한 앨범">
        {albums.length ? <LikeGrid items={albums} onOpen={openDetail} /> : <EmptyState label="좋아요한 앨범" />}
      </LikedSection>
      <LikedSection count={artists.length} title="좋아요한 아티스트">
        {artists.length ? <LikeGrid items={artists} /> : <EmptyState label="좋아요한 아티스트" />}
      </LikedSection>
    </section>
  );
}

function LikedSection({ children, count, title }: { children: React.ReactNode; count: number; title: string }) {
  return <section className="mms-section"><div className="mms-section-heading"><h2>{title}</h2><span>{count}개</span></div>{children}</section>;
}

function EmptyState({ label }: { label: string }) {
  return <p className="mms-empty">{label}이 없습니다.</p>;
}

function LikeGrid({ items, onOpen }: { items: LikeItem[]; onOpen?: (item: LikeItem) => void }) {
  return (
    <div className="mms-playlist-grid">
      {items.map((item) => {
        const canOpen = Boolean(onOpen && item.source === "tidal" && (item.entityType === "album" || item.entityType === "playlist"));
        const label = item.entityType === "album" ? "앨범" : item.entityType === "playlist" ? "플레이리스트" : "아티스트";
        return <article className="mms-playlist-card relative" key={`${item.entityType}:${item.source}:${item.sourceId}`}>
          {canOpen ? <button aria-label={`${label} ${item.title} 열기`} className="w-full text-left" type="button" onClick={() => void onOpen?.(item)}><Artwork item={item} /><h3>{item.title}</h3><p>{item.subtitle || label}</p></button> : <><Artwork item={item} /><h3>{item.title}</h3><p>{item.subtitle || label}</p></>}
          <LikeButton className="absolute right-3 top-3 bg-black/60 text-white" item={item} />
        </article>;
      })}
    </div>
  );
}

function Artwork({ item, large = false }: { item: LikeKey & LikeSnapshot; large?: boolean }) {
  return <div className={`relative aspect-square overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-600 to-slate-900 ${large ? "w-full max-w-60 rounded-xl" : "rounded-lg"}`}>{item.artworkUrl ? <Image alt="" className="object-cover" fill sizes={large ? "240px" : "(max-width: 767px) 45vw, 240px"} src={item.artworkUrl} /> : <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-3xl">♫</span>}</div>;
}
