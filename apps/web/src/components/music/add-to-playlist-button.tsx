"use client";

import { ListPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { playlistTrackInput, type MmsPlaylistSummary } from "@/lib/mms/playlists";
import type { Track } from "@/lib/music/types";
import { useLikes } from "@/providers/likes-provider";

type LoadingState = "idle" | "loading" | "ready" | "error";

export function AddToPlaylistButton({
  className = "",
  track,
}: {
  className?: string;
  track: Track;
}) {
  const { isAuthenticated } = useLikes();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadingState>("idle");
  const [playlists, setPlaylists] = useState<MmsPlaylistSummary[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const trackInput = playlistTrackInput(track);
  const trackKey = `${trackInput.source}:${trackInput.sourceId}`;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    if (!isAuthenticated) return () => window.removeEventListener("keydown", onKeyDown);

    const controller = new AbortController();
    void fetch(`/api/mms/playlists?trackKey=${encodeURIComponent(trackKey)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("playlist_load_failed");
        const body = await response.json() as { playlists: MmsPlaylistSummary[] };
        setPlaylists(body.playlists);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState("error");
        setError("플레이리스트를 불러오지 못했습니다. 다시 열어 주세요.");
      });

    return () => {
      controller.abort();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAuthenticated, open, trackKey]);

  const addToPlaylist = async (playlist: MmsPlaylistSummary) => {
    if (pendingId || playlist.containsTrack) return false;
    setPendingId(playlist.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/mms/playlists/${playlist.id}/tracks`, {
        body: JSON.stringify(trackInput),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (response.status === 409) {
        setPlaylists((current) => current.map((item) =>
          item.id === playlist.id ? { ...item, containsTrack: true } : item));
        setMessage("이미 추가된 트랙입니다.");
        return false;
      }
      if (!response.ok) throw new Error("playlist_add_failed");
      setPlaylists((current) => current.map((item) => item.id === playlist.id
        ? { ...item, containsTrack: true, trackCount: item.trackCount + 1 }
        : item));
      setMessage(`${playlist.name}에 추가했습니다.`);
      return true;
    } catch {
      setError("트랙을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setPendingId(null);
    }
  };

  const createAndAdd = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || pendingId) return;
    setPendingId("new");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mms/playlists", {
        body: JSON.stringify({ description: null, name }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("playlist_create_failed");
      const body = await response.json() as { playlist: MmsPlaylistSummary };
      setPlaylists((current) => [body.playlist, ...current]);
      setNewName("");
      setPendingId(null);
      await addToPlaylist(body.playlist);
    } catch {
      setPendingId(null);
      setError("플레이리스트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <>
      <button
        aria-label={`플레이리스트에 추가 ${track.title}`}
        className={`playlist-add-trigger ${className}`}
        title="플레이리스트에 추가"
        type="button"
        onClick={() => {
          setState(isAuthenticated ? "loading" : "idle");
          setMessage(null);
          setError(null);
          setOpen(true);
        }}
      >
        <ListPlus aria-hidden="true" />
      </button>
      {open ? (
        <div className="mms-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section
            aria-label={`${track.title} 플레이리스트에 추가`}
            aria-modal="true"
            className="mms-dialog"
            role="dialog"
          >
            <header>
              <div><p>ADD TO PLAYLIST</p><h2>{track.title}</h2><span>{track.artist}</span></div>
              <button ref={closeRef} aria-label="플레이리스트 선택 닫기" type="button" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
            </header>
            {!isAuthenticated ? (
              <div className="mms-dialog-empty">
                <p>플레이리스트를 사용하려면 로그인이 필요합니다.</p>
                <a href="/api/auth/login?returnTo=/mms">로그인하고 계속하기</a>
              </div>
            ) : (
              <>
                <div className="mms-dialog-playlists">
                  {state === "loading" ? <p role="status">플레이리스트를 불러오는 중입니다.</p> : null}
                  {state === "ready" && playlists.length === 0 ? <p>아직 만든 플레이리스트가 없습니다.</p> : null}
                  {playlists.map((playlist) => (
                    <button
                      aria-label={playlist.containsTrack ? `${playlist.name}에 이미 추가됨` : `${playlist.name}에 추가`}
                      disabled={Boolean(playlist.containsTrack || pendingId)}
                      key={playlist.id}
                      type="button"
                      onClick={() => void addToPlaylist(playlist)}
                    >
                      <span><b>{playlist.name}</b><small>{playlist.trackCount}곡</small></span>
                      <strong>{playlist.containsTrack ? "추가됨" : pendingId === playlist.id ? "추가 중" : "+ 추가"}</strong>
                    </button>
                  ))}
                </div>
                <form className="mms-dialog-create" onSubmit={createAndAdd}>
                  <label htmlFor={`playlist-name-${track.id}`}>새 플레이리스트 이름</label>
                  <div>
                    <input
                      id={`playlist-name-${track.id}`}
                      maxLength={100}
                      placeholder="예: 밤 산책"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                    <button disabled={!newName.trim() || Boolean(pendingId)} type="submit">만들고 추가</button>
                  </div>
                </form>
              </>
            )}
            {message ? <p className="mms-dialog-message" role="status">{message}</p> : null}
            {error ? <p className="mms-dialog-error" role="alert">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
