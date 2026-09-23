import { FormEvent, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { getEmsTracks, type EmsTrack, type EmsTrackPage } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

function Artwork({ track }: { track: EmsTrack }) {
  const [failed, setFailed] = useState(false);
  if (!track.artworkUrl || failed) {
    return <div className="grid size-12 place-items-center rounded-lg bg-gradient-to-br from-hud-accent-primary/40 to-hud-accent-secondary/40 text-xs">{track.title.slice(0, 2)}</div>;
  }
  return <img alt="" className="size-12 rounded-lg object-cover" onError={() => setFailed(true)} src={track.artworkUrl} />;
}

export default function Tracks() {
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [status, setStatus] = useState("");
  const [embeddingStatus, setEmbeddingStatus] = useState("");
  const [page, setPage] = useState<EmsTrackPage | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [error, setError] = useState("");

  const load = (nextCursor?: string, nextQuery = query) => {
    setError("");
    void getEmsTracks({ query: nextQuery, cursor: nextCursor, limit: 24, status: status || undefined, embeddingStatus: embeddingStatus || undefined })
      .then(setPage)
      .catch((reason: unknown) => setError(apiErrorMessage(reason)));
  };

  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
    load();
  }, [status, embeddingStatus]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = draftQuery.trim();
    setQuery(nextQuery);
    setCursor(undefined);
    setCursorHistory([]);
    load(undefined, nextQuery);
  };

  const goNext = () => {
    if (!page?.nextCursor) return;
    setCursorHistory((current) => [...current, cursor ?? ""]);
    setCursor(page.nextCursor);
    load(page.nextCursor);
  };

  const goPrevious = () => {
    const previous = cursorHistory[cursorHistory.length - 1];
    if (previous === undefined) return;
    setCursorHistory((current) => current.slice(0, -1));
    setCursor(previous || undefined);
    load(previous || undefined);
  };

  return <div className="space-y-6"><section><p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Tracks</p><h1 className="mt-2 text-3xl font-semibold">트랙 품질 확인</h1><p className="mt-2 text-sm text-hud-text-secondary">제목·아티스트·앨범과 재생·artwork·임베딩 상태를 확인합니다.</p></section><form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text-muted" size={18} /><input className="w-full rounded-xl border border-hud-border-secondary bg-hud-bg-secondary px-10 py-3 text-sm" placeholder="트랙, 아티스트, 앨범 검색" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} /></label><select aria-label="트랙 상태" className="rounded-xl border border-hud-border-secondary bg-hud-bg-secondary px-3 py-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">트랙 상태 전체</option><option value="active">active</option><option value="candidate">candidate</option><option value="stale">stale</option><option value="inactive">inactive</option><option value="rejected">rejected</option></select><select aria-label="임베딩 상태" className="rounded-xl border border-hud-border-secondary bg-hud-bg-secondary px-3 py-3 text-sm" value={embeddingStatus} onChange={(event) => setEmbeddingStatus(event.target.value)}><option value="">임베딩 전체</option><option value="completed">completed</option><option value="pending">pending</option><option value="failed">failed</option><option value="missing">missing</option></select><button className="rounded-xl bg-hud-accent-primary px-5 py-3 text-sm font-semibold text-hud-bg-primary" type="submit">검색</button></form>{error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}<div className="hud-card overflow-hidden rounded-2xl"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="border-b border-hud-border-secondary text-xs uppercase tracking-wider text-hud-text-muted"><tr><th className="px-5 py-4">트랙</th><th>상태</th><th>카테고리</th><th className="px-5">TIDAL ID</th></tr></thead><tbody>{page?.tracks.map((track) => <tr className="border-b border-hud-border-secondary/70 last:border-0" key={track.id}><td className="px-5 py-4"><div className="flex items-center gap-3"><Artwork track={track} /><div><p className="font-medium">{track.title}</p><p className="text-xs text-hud-text-secondary">{track.artist} · {track.album}</p></div></div></td><td><div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${track.playbackAvailable ? "bg-hud-accent-success/15 text-hud-accent-success" : "bg-hud-accent-danger/15 text-hud-accent-danger"}`}>{track.playbackAvailable ? "재생 가능" : "재생 불가"}</span><span className="rounded-full bg-hud-bg-hover px-2 py-1 text-hud-text-secondary">embed: {track.embeddingStatus}</span></div></td><td className="text-xs text-hud-text-secondary">{track.sections.map((section) => section.title).join(", ") || "미분류"}</td><td className="px-5 font-mono text-xs text-hud-text-muted">{track.tidalTrackId}</td></tr>)}</tbody></table></div>{page && page.tracks.length === 0 && <p className="p-10 text-center text-sm text-hud-text-muted">검색 결과가 없습니다.</p>}<div className="flex items-center justify-between border-t border-hud-border-secondary px-5 py-4 text-sm text-hud-text-secondary"><span>{page ? `${page.totalCount}곡 · ${page.page}페이지` : "불러오는 중…"}</span><div className="flex gap-2"><button className="rounded-lg border border-hud-border-secondary px-3 py-1.5 disabled:opacity-40" disabled={cursorHistory.length === 0} onClick={goPrevious} type="button">이전</button><button className="rounded-lg border border-hud-border-secondary px-3 py-1.5 disabled:opacity-40" disabled={!page?.nextCursor} onClick={goNext} type="button">다음</button></div></div></div></div>;
}
