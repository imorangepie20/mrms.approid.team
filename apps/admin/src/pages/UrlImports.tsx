import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import {
  createManualUrlImport, decideManualUrlImportItem, getManualUrlImports, startApprovedManualUrlImport,
  type ManualUrlImportJob,
} from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const statusLabels: Record<string, string> = {
  pending: "대기 중", extracting: "정보 추출 중", review: "검토 대기",
  processing: "EMS 확인 중", completed: "완료", failed: "실패",
  approved: "승인됨", queued: "검증 대기", rejected: "제외", matched: "EMS 저장 완료",
  ambiguous: "여러 결과 확인 필요", not_found: "TIDAL에서 찾지 못함",
  unavailable: "한국 재생 불가", retryable: "재시도 대기", budget_exhausted: "요청 한도 도달",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

function safeLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && ["www.melon.com", "tidal.com", "www.tidal.com", "listen.tidal.com"].includes(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

function ImportCard({ job, busyId, decide, startApproved }: {
  job: ManualUrlImportJob;
  busyId: string | null;
  decide: (id: string, action: "approve" | "reject") => void;
  startApproved: (id: string) => void;
}) {
  const sourceUrl = safeLink(job.sourceUrl);
  return <article className="hud-card overflow-hidden rounded-2xl">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hud-border-secondary px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.2em] text-hud-accent-primary">{job.sourceType === "melon" ? "Melon" : "TIDAL"} · {statusLabels[job.status] ?? job.status}</p>
        <a href={sourceUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-2 truncate text-sm text-hud-text-secondary hover:text-hud-accent-primary">
          <span className="truncate">{job.sourceUrl}</span><ExternalLink size={14} className="shrink-0" />
        </a>
      </div>
      <div className="text-right text-xs text-hud-text-muted">
        <p>{job.itemCount.toLocaleString("ko-KR")}곡 · {job.requestCount}회 요청</p>
        <p>수집 {formatDate(job.collectedAt)} · 등록 {formatDate(job.createdAt)}</p>
      </div>
    </header>
    {job.status === "review" && job.items.some((item) => item.status === "approved") && <div className="flex justify-end border-b border-hud-border-secondary px-5 py-3">
      <button type="button" disabled={busyId === job.id} onClick={() => startApproved(job.id)} className="rounded-xl bg-hud-accent-primary px-4 py-2 text-sm font-semibold text-hud-bg-primary disabled:opacity-50">{busyId === job.id ? "등록 중…" : "승인한 곡을 EMS에서 확인"}</button>
    </div>}
    {job.errorCode && <p role="alert" className="border-b border-hud-border-secondary px-5 py-3 text-sm text-hud-accent-danger">오류 코드: {job.errorCode}</p>}
    {job.items.length ? <ul className="divide-y divide-hud-border-secondary/70">
      {job.items.map((item) => {
        const itemUrl = safeLink(item.sourceItemUrl);
        const state = item.candidateStatus ?? item.status;
        return <li key={item.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-hud-bg-hover">
            {item.artworkUrl && <img src={item.artworkUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-[180px] flex-1">
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-sm text-hud-text-secondary">{item.artist}{item.album ? ` · ${item.album}` : ""}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-hud-text-muted">
              <span>{statusLabels[state] ?? state}</span>
              {item.durationMs && <span>{Math.floor(item.durationMs / 60_000)}:{String(Math.floor(item.durationMs / 1000) % 60).padStart(2, "0")}</span>}
              {item.releaseDate && <span>발매 {item.releaseDate}</span>}
              <span>수집 {formatDate(item.collectedAt)}</span>
              {item.tidalId && <span>TIDAL {item.tidalId}</span>}
              {itemUrl && <a href={itemUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-hud-accent-primary hover:underline">원문 <ExternalLink size={12} /></a>}
            </div>
          </div>
          {item.status === "review" && <div className="flex shrink-0 gap-2">
            <button type="button" disabled={busyId === item.id} onClick={() => decide(item.id, "approve")} aria-label={`${item.title} EMS 수집 승인`} className="inline-flex items-center gap-2 rounded-xl bg-hud-accent-primary px-3 py-2 text-sm font-medium text-hud-bg-primary disabled:opacity-50"><Check size={16} />승인</button>
            <button type="button" disabled={busyId === item.id} onClick={() => decide(item.id, "reject")} aria-label={`${item.title} 제외`} className="rounded-xl border border-hud-border-secondary p-2 text-hud-text-secondary hover:text-hud-accent-danger disabled:opacity-50"><X size={16} /></button>
          </div>}
        </li>;
      })}
    </ul> : job.status === "review" ? <p className="px-5 py-8 text-center text-sm text-hud-text-muted">추출된 곡이 없습니다.</p>
      : <p className="px-5 py-5 text-sm text-hud-text-muted">{statusLabels[job.phase] ?? job.phase}</p>}
  </article>;
}

export default function UrlImports() {
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<ManualUrlImportJob[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setJobs((await getManualUrlImports()).jobs); setError(""); }
    catch (reason: unknown) { setError(apiErrorMessage(reason)); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await createManualUrlImport(url.trim());
      setUrl("");
      await refresh();
    } catch (reason: unknown) { setError(apiErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id); setError("");
    try { await decideManualUrlImportItem(id, action); await refresh(); }
    catch (reason: unknown) { setError(apiErrorMessage(reason)); }
    finally { setBusyId(null); }
  }

  async function startApproved(jobId: string) {
    setBusyId(jobId); setError("");
    try { await startApprovedManualUrlImport(jobId); await refresh(); }
    catch (reason: unknown) { setError(apiErrorMessage(reason)); }
    finally { setBusyId(null); }
  }

  return <div className="space-y-6">
    <header>
      <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Public source</p>
      <h1 className="mt-2 text-3xl font-semibold">공개 음악 URL 수집</h1>
      <p className="mt-2 max-w-3xl text-sm text-hud-text-secondary">공개 페이지 정보를 추출해 출처·수집 시각과 함께 저장합니다. 검토 후 승인한 곡만 TIDAL 확인을 거쳐 EMS에 반영됩니다.</p>
    </header>

    <section className="hud-card rounded-2xl p-5">
      <form onSubmit={(event) => { void submit(event); }} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="music-source-url" className="sr-only">Melon 또는 TIDAL URL</label>
        <input id="music-source-url" type="url" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.melon.com/genre/song_list.htm?gnrCode=GN0100" className="min-w-0 flex-1 rounded-xl border border-hud-border-secondary bg-hud-bg-primary px-4 py-3 text-sm outline-none focus:border-hud-accent-primary" />
        <button type="submit" disabled={busy || !url.trim()} className="rounded-xl bg-hud-accent-primary px-5 py-3 text-sm font-semibold text-hud-bg-primary disabled:cursor-not-allowed disabled:opacity-50">{busy ? "등록 중…" : "URL 정보 가져오기"}</button>
      </form>
      <p className="mt-3 text-xs leading-5 text-hud-text-muted">지원: Melon 한국대중음악 장르 목록, TIDAL 공개 트랙·앨범·플레이리스트. 한 번에 최대 100곡까지 확인합니다. 다른 사이트와 로그인이 필요한 페이지는 지원하지 않습니다.</p>
    </section>

    {error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">최근 수집 및 검토</h2>
      <button type="button" onClick={() => { void refresh(); }} aria-label="URL 수집 내역 새로고침" className="rounded-xl border border-hud-border-secondary p-2 text-hud-text-secondary hover:bg-hud-bg-hover"><RefreshCw size={17} /></button>
    </div>
    {jobs.length ? jobs.map((job) => <ImportCard key={job.id} job={job} busyId={busyId} decide={(id, action) => { void decide(id, action); }} startApproved={(id) => { void startApproved(id); }} />)
      : <div className="hud-card rounded-2xl p-10 text-center text-sm text-hud-text-muted">아직 URL 수집 작업이 없습니다.</div>}
  </div>;
}
