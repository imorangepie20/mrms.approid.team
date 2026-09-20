"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TrackList } from "@/components/music/track-list";
import type { PersonalizationAccess } from "@/lib/auth/access-policy";
import type { Track } from "@/lib/music/types";
import { useMusicSession } from "@/providers/music-session-provider";

export type MmsPlaylist = {
  artworkUrl: string | null;
  id: string;
  name: string;
};

type SortMode = "recent" | "title" | "artist";

export function MmsLibrary({
  access,
  playlists,
  tracks,
}: {
  access?: PersonalizationAccess;
  playlists: MmsPlaylist[];
  tracks: Track[];
}) {
  const { playTrack, setQueue } = useMusicSession();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const visibleTracks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko");
    const filtered = normalized
      ? tracks.filter((track) =>
          [track.title, track.artist, track.album].some((value) =>
            value.toLocaleLowerCase("ko").includes(normalized),
          ),
        )
      : [...tracks];
    if (sort === "title") return filtered.sort((a, b) => a.title.localeCompare(b.title, "ko"));
    if (sort === "artist") return filtered.sort((a, b) => a.artist.localeCompare(b.artist, "ko"));
    return filtered;
  }, [query, sort, tracks]);

  const playTracks = (queue: Track[]) => {
    const first = queue[0];
    if (!first) return;
    const source = { id: "saved-library", type: "mms" as const };
    setQueue(queue, source);
    void playTrack(first, source);
  };

  const playShuffled = () => {
    const shuffled = [...visibleTracks];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    playTracks(shuffled);
  };

  const disconnected = access && access.connectionStatus !== "connected";

  return (
    <section className="dashboard-page mms-page">
      <header className="space-title mms-page-title"><span className="mms-title-long">My Music Space</span><span className="mms-title-short">MMS</span><small>MMS</small></header>
      <section className="mms-overview" aria-labelledby="mms-title">
        <div>
          <p>MY MUSIC LIBRARY</p>
          <h1 id="mms-title">내 음악</h1>
          <span>플레이리스트에서 모은 음악을 한곳에서 듣고 관리하세요.</span>
        </div>
        <dl>
          <div><dt>저장 트랙</dt><dd>{tracks.length}</dd></div>
          <div><dt>플레이리스트</dt><dd>{playlists.length}</dd></div>
        </dl>
        <div className="mms-actions">
          <button disabled={visibleTracks.length === 0} type="button" onClick={() => playTracks(visibleTracks)}>▶ 전체 재생</button>
          <button disabled={visibleTracks.length === 0} type="button" onClick={playShuffled}>셔플</button>
        </div>
      </section>

      {disconnected ? (
        <div className="mms-connection-notice">
          <span>저장한 음악은 그대로 유지됩니다.</span>
          <Link href="/onboarding">TIDAL 연결하기</Link>
        </div>
      ) : null}

      {playlists.length > 0 ? (
        <section className="mms-section" aria-labelledby="saved-playlists-title">
          <div className="mms-section-heading">
            <div><h2 id="saved-playlists-title">플레이리스트</h2><p>가져온 컬렉션</p></div>
            <span>{playlists.length}개</span>
          </div>
          <div className="mms-playlist-grid">
            {playlists.map((playlist) => (
              <article className="mms-playlist-card" key={playlist.id}>
                <div>
                  {playlist.artworkUrl ? <Image alt="" fill sizes="(max-width: 767px) 45vw, 240px" src={playlist.artworkUrl} /> : <span aria-hidden="true">♫</span>}
                </div>
                <h3>{playlist.name}</h3>
                <p>TIDAL 플레이리스트</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mms-section" aria-labelledby="saved-tracks-title">
        <div className="mms-section-heading mms-track-heading">
          <div><h2 id="saved-tracks-title">저장한 트랙</h2><p>{visibleTracks.length}곡</p></div>
          {tracks.length > 0 ? (
            <div className="mms-track-tools">
              <label><span className="sr-only">트랙 검색</span><input aria-label="트랙 검색" placeholder="곡, 아티스트, 앨범 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <label><span className="sr-only">트랙 정렬</span><select aria-label="트랙 정렬" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="recent">최근 저장순</option><option value="title">곡 제목순</option><option value="artist">아티스트순</option></select></label>
            </div>
          ) : null}
        </div>
        {tracks.length === 0 ? (
          <div className="mms-empty"><span aria-hidden="true">♫</span><h3>아직 저장한 음악이 없습니다</h3><p>TIDAL 플레이리스트를 선택하면 트랙이 이곳에 모입니다.</p><Link href="/onboarding">플레이리스트 가져오기</Link></div>
        ) : (
          <TrackList emptyMessage="검색 결과가 없습니다." source={{ id: "saved-library", type: "mms" }} tracks={visibleTracks} />
        )}
      </section>
    </section>
  );
}
