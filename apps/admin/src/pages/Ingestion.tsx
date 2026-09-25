import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, PauseCircle, PlayCircle, Database, ListMusic, RefreshCw } from "lucide-react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip,
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { Line } from "react-chartjs-2";
import {
  changeEmsAdminIngestion, getEmsAdminIngestion, getEmsIngestRuns,
  startEmsAdminIngestion, type EmsAdminIngestion, type EmsIngestRun,
} from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const chartOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
  scales: {
    x: { ticks: { color: "#8b98a5", maxTicksLimit: 7 }, grid: { display: false } },
    y: { beginAtZero: false, ticks: { color: "#8b98a5", precision: 0 }, grid: { color: "rgba(139,152,165,0.15)" } },
  },
};

const phaseLabels: Record<string, string> = {
  queued: "대기 중", discovering: "에디토리얼 탐색", resolving: "후보 확인",
  rate_limited: "TIDAL 요청 간격 대기", waiting_for_retry: "재시도 대기",
  embedding: "임베딩 생성", embedding_retry: "임베딩 재시도 대기",
  disk_wait: "디스크 여유 대기",
  paused: "일시정지", finished: "종료",
};

function statusClass(status: string) {
  if (status === "completed") return "bg-hud-accent-success/15 text-hud-accent-success";
  if (status === "failed") return "bg-hud-accent-danger/15 text-hud-accent-danger";
  return "bg-hud-accent-warning/15 text-hud-accent-warning";
}

function statusLabel(status: string) {
  return ({ pending: "대기", running: "진행 중", paused: "일시정지", completed: "완료", failed: "실패", rolled_back: "롤백" } as Record<string, string>)[status] ?? status;
}

function runLabel(runType: string) {
  if (runType === "musicbrainz_snapshot") return "MusicBrainz 후보 확인";
  if (runType === "tidal_resolve") return "TIDAL 에디토리얼 수집";
  if (runType === "melon_genres") return "멜론 장르 수집";
  return runType;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Database }) {
  return <article className="hud-card rounded-2xl p-5">
    <div className="flex items-center justify-between text-sm text-hud-text-secondary"><span>{label}</span><Icon size={18} className="text-hud-accent-primary" /></div>
    <p className="mt-4 text-3xl font-semibold tabular-nums">{value}</p>
  </article>;
}

export default function Ingestion() {
  const [snapshot, setSnapshot] = useState<EmsAdminIngestion | null>(null);
  const [runs, setRuns] = useState<EmsIngestRun[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const [nextSnapshot, nextRuns] = await Promise.allSettled([getEmsAdminIngestion(), getEmsIngestRuns({ limit: 10 })]);
    if (nextSnapshot.status === "fulfilled") {
      setSnapshot(nextSnapshot.value);
      setRefreshedAt(new Date());
    }
    if (nextRuns.status === "fulfilled") setRuns(nextRuns.value);
    const failure = nextSnapshot.status === "rejected" ? nextSnapshot.reason : nextRuns.status === "rejected" ? nextRuns.reason : null;
    setError(failure ? apiErrorMessage(failure) : "");
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const job = snapshot?.job;
  const currentRun = snapshot?.currentRun;
  const waitingForMusicBrainz = job?.status === "pending" && currentRun?.status === "running"
    && currentRun.runType === "musicbrainz_snapshot" && currentRun.id !== job.id;
  const action: "start" | "pause" | "resume" = job?.status === "paused"
    ? "resume" : job?.status === "pending" || job?.status === "running" ? "pause" : "start";

  async function runAction() {
    setBusy(true);
    setError("");
    try {
      if (action === "start") await startEmsAdminIngestion();
      else if (job) await changeEmsAdminIngestion(job.id, action);
      await refresh();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const chart = useMemo(() => ({
    labels: (snapshot?.catalogSamples ?? []).map((sample) => new Date(sample.sampledAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })),
    datasets: [{
      label: "활성 트랙",
      data: (snapshot?.catalogSamples ?? []).map((sample) => sample.activeTrackCount),
      borderColor: "#50d9cf", backgroundColor: "rgba(80, 217, 207, 0.13)",
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.2,
    }],
  }), [snapshot]);
  const processingChart = useMemo(() => ({
    labels: (snapshot?.runSamples ?? []).map((sample) => new Date(sample.sampledAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })),
    datasets: [
      { label: "후보", data: (snapshot?.runSamples ?? []).map((sample) => sample.candidateCount), borderColor: "#94a3b8", borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
      { label: "처리", data: (snapshot?.runSamples ?? []).map((sample) => sample.processedCount), borderColor: "#eab308", borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
      { label: "매칭", data: (snapshot?.runSamples ?? []).map((sample) => sample.matchedCount), borderColor: "#50d9cf", borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
    ],
  }), [snapshot]);

  const buttonLabel = action === "start" ? currentRun?.status === "running" ? "수동 수집 예약" : "수집 시작"
    : action === "pause" ? job?.status === "pending" ? "대기 일시정지" : "일시정지" : "재개";
  const ButtonIcon = action === "pause" ? PauseCircle : PlayCircle;
  const catalogSamples = snapshot?.catalogSamples ?? [];
  const recentArrivals = catalogSamples.length > 1
    ? catalogSamples[catalogSamples.length - 1].activeTrackCount - catalogSamples[0].activeTrackCount : 0;

  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Ingestion</p>
        <h1 className="mt-2 text-3xl font-semibold">EMS 수집</h1>
        <p className="mt-2 text-sm text-hud-text-secondary">전체 EMS 유입과 현재 후보 처리, 수동 TIDAL 작업 대기를 함께 확인합니다.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { void refresh(); }} aria-label="현황 새로고침" className="rounded-xl border border-hud-border-secondary p-3 text-hud-text-secondary hover:bg-hud-bg-hover"><RefreshCw size={18} /></button>
        <button type="button" disabled={busy || snapshot === null} onClick={() => { void runAction(); }} className="inline-flex items-center gap-2 rounded-xl bg-hud-accent-primary px-5 py-3 font-medium text-hud-bg-primary disabled:cursor-not-allowed disabled:opacity-50"><ButtonIcon size={18} />{busy ? "처리 중…" : buttonLabel}</button>
      </div>
    </section>

    {error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}

    <section aria-label="수집 현황" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="활성 트랙" value={snapshot?.activeTrackCount.toLocaleString("ko-KR") ?? "—"} icon={Database} />
      <Metric label="임베딩 완료" value={snapshot?.embeddingCompletedCount.toLocaleString("ko-KR") ?? "—"} icon={Activity} />
      <Metric label="최근 12시간 유입" value={snapshot ? recentArrivals.toLocaleString("ko-KR") : "—"} icon={Activity} />
      <Metric label={`${currentRun?.status === "running" ? "현재" : "최근"} 작업 후보 / 매칭`} value={currentRun ? `${currentRun.candidateCount.toLocaleString("ko-KR")} / ${currentRun.matchedCount.toLocaleString("ko-KR")}` : "—"} icon={ListMusic} />
      <Metric label={`${currentRun?.status === "running" ? "현재" : "최근"} 작업 처리`} value={currentRun ? `${currentRun.processedCount.toLocaleString("ko-KR")} / ${currentRun.candidateCount.toLocaleString("ko-KR")}` : "—"} icon={ListMusic} />
    </section>

    <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <article className="hud-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">전체 활성 트랙 추이</h2><span className="text-xs text-hud-text-muted">최근 12시간 유입 · 5초마다 갱신</span></div>
        {chart.labels.length ? <div className="mt-5 h-64"><Line data={chart} options={chartOptions} /></div> : <p className="mt-5 flex h-64 items-center justify-center text-sm text-hud-text-muted">유입 기록을 불러오는 중입니다.</p>}
      </article>
      <article className="hud-card rounded-2xl p-5">
        <h2 className="font-semibold">{currentRun?.status === "running" ? "현재 작업 상태" : "최근 작업 상태"}</h2>
        {currentRun ? <dl className="mt-5 space-y-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-hud-text-secondary">원천</dt><dd className="text-right">{runLabel(currentRun.runType)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-hud-text-secondary">상태</dt><dd className={`rounded-full px-2 py-0.5 text-xs ${statusClass(currentRun.status)}`}>{statusLabel(currentRun.status)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-hud-text-secondary">후보 / 처리 / 매칭</dt><dd className="tabular-nums">{currentRun.candidateCount.toLocaleString("ko-KR")} / {currentRun.processedCount.toLocaleString("ko-KR")} / {currentRun.matchedCount.toLocaleString("ko-KR")}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-hud-text-secondary">대기 / 재시도</dt><dd className="tabular-nums">{currentRun.pendingCount.toLocaleString("ko-KR")} / {currentRun.retryableCount.toLocaleString("ko-KR")}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-hud-text-secondary">시작</dt><dd>{new Date(currentRun.startedAt ?? currentRun.createdAt).toLocaleString("ko-KR")}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-hud-text-secondary">마지막 처리</dt><dd>{currentRun.heartbeatAt ? new Date(currentRun.heartbeatAt).toLocaleString("ko-KR") : "—"}</dd></div>
          {currentRun.errorCode && <div className="flex justify-between gap-4 text-hud-accent-danger"><dt>오류 코드</dt><dd>{currentRun.errorCode}</dd></div>}
          {currentRun.candidateCount > 0 && <div><div className="mb-2 flex justify-between text-xs text-hud-text-secondary"><span>후보 처리</span><span>{Math.round(currentRun.processedCount / currentRun.candidateCount * 100)}%</span></div><div role="progressbar" aria-label="현재 작업 후보 처리 진행률" aria-valuenow={currentRun.processedCount} aria-valuemin={0} aria-valuemax={currentRun.candidateCount} className="h-2 overflow-hidden rounded-full bg-hud-bg-hover"><div className="h-full rounded-full bg-hud-accent-primary transition-all" style={{ width: `${Math.min(100, currentRun.processedCount / currentRun.candidateCount * 100)}%` }} /></div></div>}
        </dl> : <p className="mt-5 text-sm text-hud-text-muted">수집 작업이 없습니다.</p>}
        <p className="mt-6 text-xs text-hud-text-muted" aria-live="polite">{refreshedAt ? `마지막 확인 ${refreshedAt.toLocaleTimeString("ko-KR")}` : "불러오는 중…"}</p>
      </article>
    </section>

    <section className="hud-card rounded-2xl p-5" aria-label="후보 처리 추이">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{currentRun ? `${runLabel(currentRun.runType)} 추이` : "후보 처리 추이"}</h2><span className="text-xs text-hud-text-muted">최근 12시간 · 회색 후보 · 노랑 처리 · 민트 매칭</span></div>
      {currentRun?.candidateCount && processingChart.labels.length ? <div className="mt-5 h-52"><Line data={processingChart} options={chartOptions} /></div> : <p className="mt-5 flex h-52 items-center justify-center text-sm text-hud-text-muted">처리할 후보가 아직 없습니다.</p>}
    </section>

    <section className="hud-card rounded-2xl p-5" aria-label="수동 TIDAL 수집">
      <h2 className="font-semibold">수동 TIDAL 수집</h2>
      {job ? <div className="mt-4 space-y-4 text-sm">
        {waitingForMusicBrainz && <p role="status" className="rounded-xl border border-hud-accent-warning/40 bg-hud-accent-warning/10 px-4 py-3 text-hud-accent-warning">MusicBrainz 후보 처리가 끝나면 대기 중인 수동 수집이 자동 시작됩니다.</p>}
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-hud-text-muted">상태 · 단계</dt><dd className="mt-1">{statusLabel(job.status)} · {phaseLabels[job.phase] ?? job.phase}</dd></div>
          <div><dt className="text-hud-text-muted">플레이리스트 탐색</dt><dd className="mt-1 tabular-nums">{job.nextPlaylistIndex} / {job.playlistCount}</dd></div>
          <div><dt className="text-hud-text-muted">TIDAL 요청</dt><dd className="mt-1 tabular-nums">{job.requestCount.toLocaleString("ko-KR")}</dd></div>
          <div><dt className="text-hud-text-muted">후보 / 매칭</dt><dd className="mt-1 tabular-nums">{job.candidateCount.toLocaleString("ko-KR")} / {job.matchedCount.toLocaleString("ko-KR")}</dd></div>
        </dl>
        {job.nextRetryAt && <p className="text-hud-text-secondary">다음 요청 가능: {new Date(job.nextRetryAt).toLocaleString("ko-KR")}</p>}
        {job.errorCode && <p className="text-hud-accent-danger">오류 코드: {job.errorCode}</p>}
      </div> : <p className="mt-4 text-sm text-hud-text-muted">수동 수집 작업이 없습니다.</p>}
    </section>

    <section className="hud-card overflow-hidden rounded-2xl">
      <div className="border-b border-hud-border-secondary px-5 py-4"><h2 className="font-semibold">수집 이력</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="border-b border-hud-border-secondary text-xs uppercase tracking-wider text-hud-text-muted"><tr><th className="px-5 py-4">실행</th><th>상태</th><th>후보 / 매칭</th><th>대기 / 모호 / 실패</th><th>오류</th><th className="px-5">생성 시각</th></tr></thead><tbody>{runs.map((run) => <tr className="border-b border-hud-border-secondary/70 last:border-0" key={run.id}><td className="px-5 py-4"><p className="font-medium">{runLabel(run.runType)}</p><p className="font-mono text-xs text-hud-text-muted">{run.id}</p></td><td><span className={`rounded-full px-2 py-1 text-xs ${statusClass(run.status)}`}>{statusLabel(run.status)}</span></td><td>{run.candidateCount} / {run.matchedCount}</td><td>{run.pendingCount} / {run.ambiguousCount} / {run.failedCount}</td><td className="text-xs text-hud-accent-danger">{run.errorCode ?? "—"}</td><td className="px-5 text-xs text-hud-text-secondary">{new Date(run.createdAt).toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div>
      {runs.length === 0 && <p className="p-10 text-center text-sm text-hud-text-muted">실행 기록이 없습니다.</p>}
    </section>
  </div>;
}
