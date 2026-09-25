import { useCallback, useEffect, useState } from "react";
import { Database, Link2, ListMusic, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import {
  changeMelonIngestion, getMelonIngestion, startMelonIngestion,
  type MelonIngestion as MelonIngestionData,
} from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const statusLabels: Record<string, string> = {
  pending: "대기 중", running: "수집 중", paused: "일시정지", completed: "완료", failed: "실패",
};

const phaseLabels: Record<string, string> = {
  queued: "대기 중", discovering: "멜론 페이지 조회", staging: "EMS 후보 저장",
  resolving: "TIDAL 매칭", paused: "일시정지", finished: "종료",
  rate_limited: "요청 간격 대기", waiting_for_retry: "재시도 대기",
  embedding: "임베딩 생성", embedding_retry: "임베딩 재시도 대기",
  batch_wait: "다음 100곡 대기",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

function melonUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "melon.com" || url.hostname.endsWith(".melon.com"))
      ? url.href : null;
  } catch {
    return null;
  }
}

function Metric({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  return <article className="hud-card rounded-2xl p-5">
    <p className="text-sm text-hud-text-secondary">{label}</p>
    <p className="mt-3 text-3xl font-semibold tabular-nums">{value === undefined ? "—" : value.toLocaleString("ko-KR")}</p>
    <p className="mt-2 text-xs text-hud-text-muted">{detail}</p>
  </article>;
}

export default function MelonIngestion() {
  const [snapshot, setSnapshot] = useState<MelonIngestionData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getMelonIngestion();
      setSnapshot(next);
      setRefreshedAt(new Date());
      setError("");
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const job = snapshot?.job;
  const action = job?.status === "paused" ? "resume"
    : job?.status === "pending" || job?.status === "running" ? "pause" : "start";
  const maxGenreCount = Math.max(1, ...(snapshot?.genres ?? []).map((genre) => genre.trackCount));
  const stagedPercent = job && job.discoveredCount > 0
    ? Math.min(100, Math.round(job.stagedCount / job.discoveredCount * 100)) : 0;

  async function runAction() {
    setBusy(true);
    setError("");
    try {
      if (action === "start") await startMelonIngestion();
      else if (job) await changeMelonIngestion(job.id, action);
      await refresh();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Melon</p>
        <h1 className="mt-2 text-3xl font-semibold">멜론 K-pop 수집</h1>
        <p className="mt-2 max-w-2xl text-sm text-hud-text-secondary">한국대중음악 최신곡을 100곡씩 수집합니다. 각 묶음의 TIDAL 확인이 끝나면 1분 뒤 다음 묶음을 자동 시작합니다.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { void refresh(); }} aria-label="멜론 수집 현황 새로고침" className="rounded-xl border border-hud-border-secondary p-3 text-hud-text-secondary hover:bg-hud-bg-hover"><RefreshCw size={18} /></button>
        <button type="button" disabled={busy || snapshot === null} onClick={() => { void runAction(); }} className="inline-flex items-center gap-2 rounded-xl bg-hud-accent-primary px-5 py-3 font-medium text-hud-bg-primary disabled:cursor-not-allowed disabled:opacity-50">
          {action === "pause" ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
          {busy ? "처리 중…" : action === "pause" ? "일시정지" : action === "resume" ? "재개" : "수집 시작"}
        </button>
      </div>
    </header>

    {error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}

    <section aria-label="멜론 수집 합계" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="멜론 원천곡" value={snapshot?.totals.sourceTracks} detail="중복을 제외한 저장 곡" />
      <Metric label="TIDAL 연결곡" value={snapshot?.totals.matchedTracks} detail="재생 정보가 연결된 원천곡" />
      <Metric label="이번 작업 발견" value={job?.discoveredCount} detail="현재 작업에서 찾은 곡" />
      <Metric label="이번 작업 EMS 후보" value={job?.stagedCount} detail="매칭 대상으로 저장한 곡" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <article className="hud-card rounded-2xl p-5">
        <div className="flex items-center gap-2"><Database size={18} className="text-hud-accent-primary" /><h2 className="font-semibold">현재 작업</h2></div>
        {job ? <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${job.status === "completed" ? "bg-hud-accent-success/15 text-hud-accent-success" : job.status === "failed" ? "bg-hud-accent-danger/15 text-hud-accent-danger" : "bg-hud-accent-warning/15 text-hud-accent-warning"}`}>{statusLabels[job.status] ?? job.status}</span>
            <span className="text-sm text-hud-text-secondary">{phaseLabels[job.phase] ?? job.phase}</span>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-hud-text-muted">조회 장르</dt><dd className="mt-1">{job.genreName ?? "—"}{job.genreCode ? ` · ${job.genreCode}` : ""}</dd></div>
            <div><dt className="text-hud-text-muted">다음 목록 위치</dt><dd className="mt-1 tabular-nums">{job.nextStartIndex.toLocaleString("ko-KR")}</dd></div>
            <div><dt className="text-hud-text-muted">멜론 요청</dt><dd className="mt-1 tabular-nums">{job.requestCount.toLocaleString("ko-KR")}</dd></div>
            <div><dt className="text-hud-text-muted">이번 작업 TIDAL 연결</dt><dd className="mt-1 tabular-nums">{job.matchedCount.toLocaleString("ko-KR")}</dd></div>
            <div><dt className="text-hud-text-muted">현재 100곡 묶음</dt><dd className="mt-1 tabular-nums">{job.batchDiscoveredCount.toLocaleString("ko-KR")} / 100곡</dd></div>
            <div><dt className="text-hud-text-muted">확인 대기 후보</dt><dd className="mt-1 tabular-nums">{job.pendingCount.toLocaleString("ko-KR")}</dd></div>
            {job.nextBatchAt && <div><dt className="text-hud-text-muted">다음 묶음</dt><dd className="mt-1">{formatDate(job.nextBatchAt)}</dd></div>}
            <div><dt className="text-hud-text-muted">시작</dt><dd className="mt-1">{formatDate(job.createdAt)}</dd></div>
            <div><dt className="text-hud-text-muted">마지막 업데이트</dt><dd className="mt-1">{formatDate(job.updatedAt)}</dd></div>
          </dl>
          {job.discoveredCount > 0 && <div>
            <div className="mb-2 flex justify-between text-xs text-hud-text-secondary"><span>발견곡 중 후보 저장</span><span className="tabular-nums">{job.stagedCount.toLocaleString("ko-KR")} / {job.discoveredCount.toLocaleString("ko-KR")}</span></div>
            <div role="progressbar" aria-label="멜론 발견곡 후보 저장률" aria-valuenow={Math.min(job.stagedCount, job.discoveredCount)} aria-valuemin={0} aria-valuemax={job.discoveredCount} className="h-2 overflow-hidden rounded-full bg-hud-bg-hover"><div className="h-full rounded-full bg-hud-accent-primary" style={{ width: `${stagedPercent}%` }} /></div>
          </div>}
          {job.errorCode && <p role="alert" className="text-sm text-hud-accent-danger">오류 코드: {job.errorCode}</p>}
          {job.finishedAt && <p className="text-xs text-hud-text-muted">종료: {formatDate(job.finishedAt)}</p>}
        </div> : <p className="mt-5 text-sm text-hud-text-muted">수집 작업이 없습니다. 수집 시작을 누르면 한국대중음악 장르를 순회합니다.</p>}
        <p className="mt-6 text-xs text-hud-text-muted" aria-live="polite">{refreshedAt ? `마지막 확인 ${refreshedAt.toLocaleTimeString("ko-KR")} · 5초마다 갱신` : "불러오는 중…"}</p>
      </article>

      <article className="hud-card rounded-2xl p-5">
        <div className="flex items-center gap-2"><ListMusic size={18} className="text-hud-accent-primary" /><h2 className="font-semibold">장르별 원천곡</h2></div>
        {snapshot?.genres.length ? <ol className="mt-5 space-y-4">
          {snapshot.genres.map((genre) => <li key={genre.code}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span>{genre.name} <span className="text-xs text-hud-text-muted">{genre.code}</span></span><span className="tabular-nums text-hud-text-secondary">{genre.trackCount.toLocaleString("ko-KR")}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hud-bg-hover"><div className="h-full rounded-full bg-hud-accent-primary/80" style={{ width: `${genre.trackCount / maxGenreCount * 100}%` }} /></div>
          </li>)}
        </ol> : <p className="mt-5 text-sm text-hud-text-muted">저장된 장르별 곡이 없습니다.</p>}
      </article>
    </section>

    <section className="hud-card overflow-hidden rounded-2xl" aria-label="최근 멜론 원천곡">
      <div className="border-b border-hud-border-secondary px-5 py-4"><h2 className="font-semibold">최근 확인한 원천곡</h2><p className="mt-1 text-xs text-hud-text-muted">곡명, 가수, 앨범, 장르, 원문 링크와 최초·최근 확인일</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-hud-border-secondary text-xs text-hud-text-muted"><tr><th className="px-5 py-3">곡 · 가수</th><th className="py-3">앨범</th><th className="py-3">장르</th><th className="py-3">TIDAL</th><th className="py-3">최초 확인</th><th className="py-3">최근 확인</th><th className="px-5 py-3">출처</th></tr></thead><tbody>
        {(snapshot?.tracks ?? []).map((track) => <tr key={track.songId} className="border-b border-hud-border-secondary/70 last:border-0"><td className="px-5 py-4"><p className="font-medium">{track.title}</p><p className="mt-1 text-xs text-hud-text-secondary">{track.artist}</p></td><td className="py-4 text-hud-text-secondary">{track.album || "—"}</td><td className="py-4 text-xs text-hud-text-secondary">{track.genres.join(", ") || "—"}</td><td className="py-4">{track.tidalId ? <span className="text-hud-accent-success">연결</span> : <span className="text-hud-text-muted">대기</span>}</td><td className="py-4 text-xs text-hud-text-secondary">{formatDate(track.firstSeenAt)}</td><td className="py-4 text-xs text-hud-text-secondary">{formatDate(track.lastSeenAt)}</td><td className="px-5 py-4">{melonUrl(track.sourceUrl) ? <a href={melonUrl(track.sourceUrl) ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`${track.title} 멜론 원문 열기`} className="inline-flex items-center gap-1 text-hud-accent-primary hover:underline"><Link2 size={15} />멜론</a> : "—"}</td></tr>)}
      </tbody></table></div>
      {snapshot && snapshot.tracks.length === 0 && <p className="p-10 text-center text-sm text-hud-text-muted">아직 수집한 원천곡이 없습니다.</p>}
    </section>
  </div>;
}
