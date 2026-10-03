"use client";

import { ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { LikeButton } from "@/components/music/like-button";
import { TrackList } from "@/components/music/track-list";
import type { PersonalizationAccess } from "@/lib/auth/access-policy";
import type { LikeItem, LikeKey, LikeSnapshot } from "@/lib/likes/types";
import type {
  MmsPlaylistDetail,
  MmsPlaylistMetadata,
  MmsPlaylistSummary,
  MmsPlaylistTrack,
} from "@/lib/mms/playlists";
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

type InternalView = {
  error: string | null;
  id: string;
  playlist: MmsPlaylistDetail | null;
  status: "loading" | "ready" | "error";
};

type PlaylistEditor = {
  mode: "create" | "edit";
  playlist: MmsPlaylistSummary | null;
};

export type MmsImportedPlaylist = {
  artworkUrl: string | null;
  id: string;
  name: string;
  tidalPlaylistId: string;
  tracks: Track[];
};

function sameLike(left: LikeKey, right: LikeKey) {
  return left.entityType === right.entityType && left.source === right.source && left.sourceId === right.sourceId;
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
  const durationSeconds = typeof item.metadata.durationSeconds === "number" ? item.metadata.durationSeconds : null;
  return {
    album: typeof item.metadata.album === "string" ? item.metadata.album : "Unknown Album",
    artist: item.subtitle || "Unknown Artist",
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    artworkUrl: item.artworkUrl,
    durationSeconds,
    id: item.source === "tidal" ? `liked-track:${item.sourceId}` : item.sourceId,
    playbackAvailable: typeof item.metadata.playbackAvailable === "boolean" ? item.metadata.playbackAvailable : true,
    tidalTrackId: item.source === "tidal" ? item.sourceId : undefined,
    title: item.title,
  };
}

export function MmsLibrary({
  access,
  acceptedRecommendationTracks = [],
  importedPlaylists = [],
  mmsPlaylists = [],
}: {
  access?: PersonalizationAccess;
  acceptedRecommendationTracks?: Track[];
  importedPlaylists?: MmsImportedPlaylist[];
  mmsPlaylists?: MmsPlaylistSummary[];
}) {
  const { items } = useLikes();
  const { playQueue } = useMusicSession();
  const [ownedPlaylists, setOwnedPlaylists] = useState(mmsPlaylists);
  const [selectedDetail, setDetail] = useState<CatalogDetail | null>(null);
  const [internalView, setInternalView] = useState<InternalView | null>(null);
  const [editor, setEditor] = useState<PlaylistEditor | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const tracks = items.filter((item) => item.entityType === "track").map(likedTrackToTrack);
  const playlists = items.filter((item) => item.entityType === "playlist");
  const albums = items.filter((item) => item.entityType === "album");
  const artists = items.filter((item) => item.entityType === "artist");

  const detail = selectedDetail && (
    selectedDetail.origin === "imported" || items.some((item) => sameLike(item, selectedDetail.item))
  ) ? selectedDetail : null;

  const playTracks = (queue: Track[], sourceId = "liked-tracks") => {
    void playQueue(queue, { id: sourceId, type: "mms" });
  };

  const playShuffled = (queue: Track[], sourceId: string) => {
    void playQueue(queue, { id: sourceId, type: "mms" }, { shuffle: true });
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
      setDetail({ error: "트랙을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", item, origin: "liked", sourceId, status: "error", tracks: [] });
    }
  };

  const openImportedPlaylist = (playlist: MmsImportedPlaylist) => {
    setDetail({ error: null, item: importedPlaylistLikeItem(playlist), origin: "imported", sourceId: `imported-playlist:${playlist.id}`, status: "ready", tracks: playlist.tracks });
  };

  const openInternalPlaylist = async (playlist: MmsPlaylistSummary) => {
    setMutationError(null);
    setInternalView({ error: null, id: playlist.id, playlist: null, status: "loading" });
    try {
      const response = await fetch(`/api/mms/playlists/${playlist.id}`);
      if (!response.ok) throw new Error("playlist_load_failed");
      const body = await response.json() as { playlist: MmsPlaylistDetail };
      setInternalView({ error: null, id: playlist.id, playlist: body.playlist, status: "ready" });
    } catch {
      setInternalView({ error: "플레이리스트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", id: playlist.id, playlist: null, status: "error" });
    }
  };

  const savePlaylist = async (metadata: MmsPlaylistMetadata) => {
    if (!editor || pending) return;
    setPending("playlist-save");
    setMutationError(null);
    const editing = editor.mode === "edit" && editor.playlist;
    try {
      const response = await fetch(editing ? `/api/mms/playlists/${editing.id}` : "/api/mms/playlists", {
        body: JSON.stringify(metadata),
        headers: { "content-type": "application/json" },
        method: editing ? "PATCH" : "POST",
      });
      if (!response.ok) throw new Error("playlist_save_failed");
      const body = await response.json() as { playlist: MmsPlaylistSummary };
      setOwnedPlaylists((current) => editing
        ? current.map((item) => item.id === body.playlist.id ? body.playlist : item)
        : [body.playlist, ...current]);
      if (editing) {
        setInternalView((current) => current?.playlist ? { ...current, playlist: { ...current.playlist, ...body.playlist } } : current);
      }
      setEditor(null);
    } catch {
      setMutationError("플레이리스트를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  const removeInternalTrack = async (item: MmsPlaylistTrack) => {
    const playlist = internalView?.playlist;
    if (!playlist || pending) return;
    setPending(`remove:${item.id}`);
    setMutationError(null);
    try {
      const response = await fetch(`/api/mms/playlists/${playlist.id}/tracks/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("playlist_track_delete_failed");
      const remaining = playlist.tracks.filter((candidate) => candidate.id !== item.id).map((candidate, position) => ({ ...candidate, position }));
      setInternalView({ ...internalView, playlist: { ...playlist, trackCount: remaining.length, tracks: remaining } });
      setOwnedPlaylists((current) => current.map((candidate) => candidate.id === playlist.id ? { ...candidate, trackCount: remaining.length } : candidate));
    } catch {
      setMutationError("트랙을 제거하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  const moveInternalTrack = async (index: number, offset: -1 | 1) => {
    const playlist = internalView?.playlist;
    const target = index + offset;
    if (!playlist || pending || target < 0 || target >= playlist.tracks.length) return;
    const reordered = [...playlist.tracks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPending("reorder");
    setMutationError(null);
    try {
      const response = await fetch(`/api/mms/playlists/${playlist.id}/tracks/reorder`, {
        body: JSON.stringify({ itemIds: reordered.map((item) => item.id) }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error("playlist_reorder_failed");
      setInternalView({ ...internalView, playlist: { ...playlist, tracks: reordered.map((item, position) => ({ ...item, position })) } });
    } catch {
      setMutationError("트랙 순서를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  const deleteInternalPlaylist = async () => {
    const playlist = internalView?.playlist;
    if (!playlist || pending) return;
    setPending("playlist-delete");
    setMutationError(null);
    try {
      const response = await fetch(`/api/mms/playlists/${playlist.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("playlist_delete_failed");
      setOwnedPlaylists((current) => current.filter((item) => item.id !== playlist.id));
      setDeleteConfirm(false);
      setInternalView(null);
    } catch {
      setMutationError("플레이리스트를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(null);
    }
  };

  if (internalView) {
    const playlist = internalView.playlist;
    const sourceId = `mms-playlist:${internalView.id}`;
    return (
      <section className="dashboard-page mms-page">
        <MmsPageTitle />
        <section className="w-full pb-10 pt-6 sm:py-8">
          <button aria-label="MMS 목록으로 돌아가기" className="mms-back-button" type="button" onClick={() => setInternalView(null)}>← MMS 목록으로 돌아가기</button>
          {internalView.status === "loading" ? <p className="mms-detail-status" role="status">플레이리스트를 불러오는 중입니다.</p> : null}
          {internalView.status === "error" ? <div className="mms-detail-status" role="alert"><p>{internalView.error}</p><button type="button" onClick={() => { const summary = ownedPlaylists.find((item) => item.id === internalView.id); if (summary) void openInternalPlaylist(summary); }}>다시 시도</button></div> : null}
          {playlist ? (
            <>
              <header className="mms-internal-detail-header">
                <div className="mms-internal-cover" aria-hidden="true">♫</div>
                <div>
                  <p>내 플레이리스트 · MMS</p><h1>{playlist.name}</h1>
                  {playlist.description ? <span>{playlist.description}</span> : null}<small>{playlist.tracks.length}곡</small>
                  <div className="mms-detail-actions">
                    <button disabled={!playlist.tracks.length} type="button" onClick={() => playTracks(playlist.tracks.map((item) => item.track), sourceId)}>전체 재생</button>
                    <button disabled={!playlist.tracks.length} type="button" onClick={() => playShuffled(playlist.tracks.map((item) => item.track), sourceId)}>셔플</button>
                    <button type="button" onClick={() => setEditor({ mode: "edit", playlist })}><Pencil aria-hidden="true" />플레이리스트 편집</button>
                    <button className="mms-danger-button" type="button" onClick={() => setDeleteConfirm(true)}><Trash2 aria-hidden="true" />플레이리스트 삭제</button>
                  </div>
                </div>
              </header>
              {mutationError ? <p className="mms-mutation-error" role="alert">{mutationError}</p> : null}
              <div className="mt-7">
                <TrackList
                  emptyMessage="이 플레이리스트에는 아직 트랙이 없습니다. 다른 음악 화면에서 트랙을 추가해 보세요."
                  source={{ id: sourceId, type: "mms" }}
                  tracks={playlist.tracks.map((item) => item.track)}
                  renderActions={(track, index) => {
                    const item = playlist.tracks[index];
                    return <span className="mms-track-actions">
                      <button aria-label={`${track.title} 위로 이동`} disabled={index === 0 || Boolean(pending)} title="위로 이동" type="button" onClick={() => void moveInternalTrack(index, -1)}><ChevronUp aria-hidden="true" /></button>
                      <button aria-label={`${track.title} 아래로 이동`} disabled={index === playlist.tracks.length - 1 || Boolean(pending)} title="아래로 이동" type="button" onClick={() => void moveInternalTrack(index, 1)}><ChevronDown aria-hidden="true" /></button>
                      <button aria-label={`플레이리스트에서 ${track.title} 제거`} disabled={Boolean(pending)} title="플레이리스트에서 제거" type="button" onClick={() => void removeInternalTrack(item)}><Trash2 aria-hidden="true" /></button>
                    </span>;
                  }}
                />
              </div>
            </>
          ) : null}
        </section>
        {editor ? <PlaylistEditorDialog editor={editor} error={mutationError} pending={Boolean(pending)} onClose={() => setEditor(null)} onSave={savePlaylist} /> : null}
        {deleteConfirm && playlist ? <DeletePlaylistDialog name={playlist.name} pending={Boolean(pending)} onCancel={() => setDeleteConfirm(false)} onDelete={deleteInternalPlaylist} /> : null}
      </section>
    );
  }

  if (detail) {
    const sourceId = detail.sourceId;
    return (
      <section className="dashboard-page mms-page">
        <MmsPageTitle />
        <section className="w-full pb-10 pt-6 sm:py-8">
          <button aria-label="MMS 목록으로 돌아가기" className="mms-back-button" type="button" onClick={() => setDetail(null)}>← MMS 목록으로 돌아가기</button>
          <header className="mt-5 grid gap-6 border-b border-[var(--border)] pb-8 sm:grid-cols-[minmax(180px,240px)_1fr] sm:items-end">
            <Artwork item={detail.item} large />
            <div className="min-w-0">
              <p className="text-sm text-[var(--muted)]">{detail.origin === "imported" ? "가져온 플레이리스트" : `좋아요한 ${detail.item.entityType === "album" ? "앨범" : "플레이리스트"}`} · TIDAL</p>
              <h1 className="mt-2 text-3xl font-[620] tracking-[-0.035em] text-[var(--foreground)] sm:text-4xl">{detail.item.title}</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">{detail.origin === "imported" ? `${detail.tracks.length}곡` : `${detail.item.subtitle}${detail.status === "ready" ? ` · ${detail.tracks.length}곡` : ""}`}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button className="min-h-11 rounded-lg bg-[var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-40" disabled={detail.status !== "ready" || !detail.tracks.length} type="button" onClick={() => playTracks(detail.tracks, sourceId)}>전체 재생</button>
                <button className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-5 text-sm font-semibold text-[var(--muted)] disabled:opacity-40" disabled={detail.status !== "ready" || !detail.tracks.length} type="button" onClick={() => playShuffled(detail.tracks, sourceId)}>셔플</button>
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
      <MmsPageTitle />
      <section className="mms-overview" aria-labelledby="mms-title">
        <div><p>PERSONAL MUSIC LIBRARY</p><h1 id="mms-title">My Music Space</h1><span>내 플레이리스트, 가져온 음악과 좋아요를 한곳에서 관리하세요.</span></div>
        <dl data-testid="like-summaries">
          <div><dt>좋아요한 트랙</dt><dd data-testid="liked-track-count">{tracks.length}</dd></div>
          <div><dt>좋아요한 플레이리스트</dt><dd>{playlists.length}</dd></div>
          <div><dt>좋아요한 앨범</dt><dd>{albums.length}</dd></div>
          <div><dt>좋아요한 아티스트</dt><dd>{artists.length}</dd></div>
        </dl>
      </section>
      {disconnected ? <div className="mms-connection-notice"><span>좋아요는 그대로 유지됩니다.</span><Link href="/onboarding">TIDAL 연결하기</Link></div> : null}

      <LikedSection action={<button className="mms-create-button" type="button" onClick={() => { setMutationError(null); setEditor({ mode: "create", playlist: null }); }}>새 플레이리스트</button>} count={ownedPlaylists.length} title="내 플레이리스트">
        {ownedPlaylists.length ? <div className="mms-playlist-grid">{ownedPlaylists.map((playlist) => (
          <article className="mms-playlist-card mms-owned-playlist-card" key={playlist.id}>
            <button aria-label={`내 플레이리스트 ${playlist.name} 열기`} className="w-full text-left" type="button" onClick={() => void openInternalPlaylist(playlist)}>
              <div aria-hidden="true">♫</div><h3>{playlist.name}</h3><p>MMS · {playlist.trackCount}곡</p>{playlist.description ? <span>{playlist.description}</span> : null}
            </button>
          </article>
        ))}</div> : <EmptyState label="내 플레이리스트" />}
      </LikedSection>

      <LikedSection count={importedPlaylists.length} title="가져온 플레이리스트">
        {importedPlaylists.length ? <div className="mms-playlist-grid">{importedPlaylists.map((playlist) => {
          const likeItem = importedPlaylistLikeItem(playlist);
          return <article className="mms-playlist-card relative" key={playlist.id}>
            <button aria-label={`가져온 플레이리스트 ${playlist.name} 열기`} className="w-full text-left" type="button" onClick={() => openImportedPlaylist(playlist)}><Artwork item={likeItem} /><h3>{playlist.name}</h3><p>TIDAL · {playlist.tracks.length}곡</p></button>
            <LikeButton className="absolute right-3 top-3 bg-black/60 text-white" item={likeItem} />
          </article>;
        })}</div> : <EmptyState label="가져온 플레이리스트" />}
      </LikedSection>
      <LikedSection count={acceptedRecommendationTracks.length} title="수락한 추천">
        <TrackList mobileStacked emptyMessage="아직 수락한 추천이 없습니다. GMS에서 마음에 드는 곡을 수락해 보세요." source={{ id: "accepted-recommendations", type: "mms" }} tracks={acceptedRecommendationTracks} />
      </LikedSection>
      <LikedSection count={tracks.length} title="좋아요한 트랙">{tracks.length ? <TrackList source={{ id: "liked-tracks", type: "mms" }} tracks={tracks} /> : <EmptyState label="좋아요한 트랙" />}</LikedSection>
      <LikedSection count={playlists.length} title="좋아요한 플레이리스트">{playlists.length ? <LikeGrid items={playlists} onOpen={openDetail} /> : <EmptyState label="좋아요한 플레이리스트" />}</LikedSection>
      <LikedSection count={albums.length} title="좋아요한 앨범">{albums.length ? <LikeGrid items={albums} onOpen={openDetail} /> : <EmptyState label="좋아요한 앨범" />}</LikedSection>
      <LikedSection count={artists.length} title="좋아요한 아티스트">{artists.length ? <LikeGrid items={artists} /> : <EmptyState label="좋아요한 아티스트" />}</LikedSection>
      {editor ? <PlaylistEditorDialog editor={editor} error={mutationError} pending={Boolean(pending)} onClose={() => setEditor(null)} onSave={savePlaylist} /> : null}
    </section>
  );
}

function PlaylistEditorDialog({ editor, error, onClose, onSave, pending }: { editor: PlaylistEditor; error: string | null; onClose: () => void; onSave: (metadata: MmsPlaylistMetadata) => Promise<void>; pending: boolean }) {
  const [name, setName] = useState(editor.playlist?.name ?? "");
  const [description, setDescription] = useState(editor.playlist?.description ?? "");
  const editing = editor.mode === "edit";
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) void onSave({ description: description.trim() || null, name: name.trim() });
  };
  return <div className="mms-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-label={editing ? "플레이리스트 편집" : "새 플레이리스트"} aria-modal="true" className="mms-dialog" role="dialog">
      <header><div><p>{editing ? "EDIT PLAYLIST" : "NEW PLAYLIST"}</p><h2>{editing ? "플레이리스트 편집" : "새 플레이리스트"}</h2></div><button aria-label="플레이리스트 편집 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button></header>
      <form className="mms-editor-form" onSubmit={submit}>
        <label>플레이리스트 이름<input autoFocus maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>설명<textarea maxLength={500} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="mms-dialog-actions"><button type="button" onClick={onClose}>취소</button><button disabled={!name.trim() || pending} type="submit">{editing ? "변경사항 저장" : "플레이리스트 만들기"}</button></div>
      </form>
    </section>
  </div>;
}

function DeletePlaylistDialog({ name, onCancel, onDelete, pending }: { name: string; onCancel: () => void; onDelete: () => Promise<void>; pending: boolean }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);
  return <div className="mms-dialog-backdrop" role="presentation"><section aria-label={`${name} 삭제`} aria-modal="true" className="mms-dialog mms-delete-dialog" role="alertdialog">
    <header><div><p>DELETE PLAYLIST</p><h2>{name} 삭제</h2></div><button aria-label="삭제 확인 닫기" type="button" onClick={onCancel}><X aria-hidden="true" /></button></header>
    <p>이 플레이리스트와 목록 안의 항목만 삭제됩니다. 원본 음악, 가져온 TIDAL 데이터와 좋아요는 유지됩니다.</p>
    <div className="mms-dialog-actions"><button type="button" onClick={onCancel}>취소</button><button className="mms-danger-button" disabled={pending} type="button" onClick={() => void onDelete()}>플레이리스트 영구 삭제</button></div>
  </section></div>;
}

function MmsPageTitle() {
  return <header className="space-title mms-page-title"><span className="mms-title-long">My Music Space</span><span className="mms-title-short">MMS</span><small>MMS</small></header>;
}

function LikedSection({ action, children, count, title }: { action?: ReactNode; children: ReactNode; count: number; title: string }) {
  return <section className="mms-section"><div className="mms-section-heading"><div><h2>{title}</h2><span>{count}개</span></div>{action}</div>{children}</section>;
}

function EmptyState({ label }: { label: string }) {
  const suffix = label === "내 플레이리스트" ? "가" : "이";
  return <p className="mms-empty">{label}{suffix} 없습니다.</p>;
}

function LikeGrid({ items, onOpen }: { items: LikeItem[]; onOpen?: (item: LikeItem) => void }) {
  return <div className="mms-playlist-grid">{items.map((item) => {
    const canOpen = Boolean(onOpen && item.source === "tidal" && (item.entityType === "album" || item.entityType === "playlist"));
    const label = item.entityType === "album" ? "앨범" : item.entityType === "playlist" ? "플레이리스트" : "아티스트";
    return <article className="mms-playlist-card relative" key={`${item.entityType}:${item.source}:${item.sourceId}`}>
      {canOpen ? <button aria-label={`${label} ${item.title} 열기`} className="w-full text-left" type="button" onClick={() => void onOpen?.(item)}><Artwork item={item} /><h3>{item.title}</h3><p>{item.subtitle || label}</p></button> : <><Artwork item={item} /><h3>{item.title}</h3><p>{item.subtitle || label}</p></>}
      <LikeButton className="absolute right-3 top-3 bg-black/60 text-white" item={item} />
    </article>;
  })}</div>;
}

function Artwork({ item, large = false }: { item: LikeKey & LikeSnapshot; large?: boolean }) {
  return <div className={`relative aspect-square overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-600 to-slate-900 ${large ? "w-full max-w-60 rounded-xl" : "rounded-lg"}`}>{item.artworkUrl ? <Image alt="" className="object-cover" fill sizes={large ? "240px" : "(max-width: 767px) 45vw, 240px"} src={item.artworkUrl} /> : <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-3xl">♫</span>}</div>;
}
