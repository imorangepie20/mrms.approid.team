import { useCallback, useEffect, useState } from "react";
import { Activity, AudioWaveform, Database, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import {
  getAudioAnalysis,
  getAudioAnalysisTrack,
  requeueAudioAnalysisTrack,
  type AudioAnalysisAdminData,
  type AudioAnalysisStatus,
  type AudioAnalysisTrackDetail,
} from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const FEATURE_VERSION = "essentia-dsp-v1" as const;
const statuses: AudioAnalysisStatus[] = ["missing", "pending", "running", "completed", "retryable", "failed"];
const statusLabels: Record<AudioAnalysisStatus, string> = {
  missing: "미등록", pending: "대기", running: "처리 중", completed: "완료", retryable: "재시도", failed: "종료 오류",
};

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function StatusBadge({ status }: { status: AudioAnalysisStatus }) {
  const color = status === "completed"
    ? "border-hud-accent-success/40 bg-hud-accent-success/10 text-hud-accent-success"
    : status === "failed"
      ? "border-hud-accent-danger/40 bg-hud-accent-danger/10 text-hud-accent-danger"
      : status === "retryable"
        ? "border-hud-accent-warning/40 bg-hud-accent-warning/10 text-hud-accent-warning"
        : "border-hud-border-secondary bg-hud-bg-primary text-hud-text-secondary";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>{statusLabels[status]}</span>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="hud-card min-w-0 rounded-2xl p-5">
    <p className="text-xs uppercase tracking-[0.18em] text-hud-text-muted">{label}</p>
    <p className="mt-3 break-words font-mono text-2xl font-semibold text-hud-text-primary">{value}</p>
    <p className="mt-2 text-sm text-hud-text-secondary">{note}</p>
  </article>;
}

export default function AudioAnalysis() {
  const [data, setData] = useState<AudioAnalysisAdminData | null>(null);
  const [detail, setDetail] = useState<AudioAnalysisTrackDetail | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState<AudioAnalysisStatus | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [requeueing, setRequeueing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getAudioAnalysis({ query: appliedQuery || undefined, status: status || undefined, page, limit: 20 }));
      setError("");
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, status]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function openTrack(trackId: string) {
    setDetailLoading(true);
    try {
      setDetail(await getAudioAnalysisTrack(trackId));
      setError("");
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setDetailLoading(false);
    }
  }

  async function requeue() {
    if (!detail || !window.confirm(`${detail.title}을 ${FEATURE_VERSION}으로 다시 처리 대기열에 넣을까요?`)) return;
    setRequeueing(true);
    try {
      await requeueAudioAnalysisTrack(detail.id, FEATURE_VERSION);
      await refresh();
      setDetail(await getAudioAnalysisTrack(detail.id));
      setError("");
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setRequeueing(false);
    }
  }

  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / AUDIO ANALYSIS</p>
        <h1 className="mt-2 text-3xl font-semibold">오디오 분석 관측</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-hud-text-secondary">활성 EMS 전체의 분석 coverage, version, 오류와 트랙별 DSP·prediction을 확인합니다. 재처리는 선택한 한 트랙과 고정 version만 대기열에 등록합니다.</p>
      </div>
      <button type="button" onClick={() => { void refresh(); }} aria-label="오디오 분석 새로고침" className="rounded-xl border border-hud-border-secondary p-3 text-hud-text-secondary hover:bg-hud-bg-hover"><RefreshCw size={18} /></button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}

    <form className="hud-card flex flex-wrap items-end gap-3 rounded-2xl p-4" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); }}>
      <label className="min-w-[220px] flex-1 text-sm text-hud-text-secondary">트랙 검색
        <span className="mt-1 flex items-center gap-2 rounded-xl border border-hud-border-secondary bg-hud-bg-primary px-3"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} className="min-w-0 flex-1 bg-transparent py-2.5 text-hud-text-primary outline-none" placeholder="제목, 아티스트, 앨범" /></span>
      </label>
      <label className="text-sm text-hud-text-secondary">상태
        <select value={status} onChange={(event) => { setStatus(event.target.value as AudioAnalysisStatus | ""); setPage(1); }} className="mt-1 block rounded-xl border border-hud-border-secondary bg-hud-bg-primary px-3 py-2.5 text-hud-text-primary">
          <option value="">전체</option>{statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
        </select>
      </label>
      <button type="submit" className="rounded-xl bg-hud-accent-primary px-4 py-2.5 text-sm font-semibold text-black">조회</button>
    </form>

    {loading && !data && <div className="hud-card rounded-2xl p-6 text-sm text-hud-text-secondary">분석 현황을 불러오는 중입니다.</div>}

    {data && <>
      <section aria-labelledby="coverage-title" className="space-y-4">
        <div className="flex items-center gap-2"><Activity size={20} className="text-hud-accent-primary" /><h2 id="coverage-title" className="text-xl font-semibold">전체 coverage</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="활성 EMS" value={data.coverage.activeTrackCount.toLocaleString("ko-KR")} note="현재 분석 대상 전체 트랙" />
          <Metric label="STAGED" value={percent(data.coverage.stagedRatio)} note={`${data.coverage.stagedTrackCount.toLocaleString("ko-KR")}곡 job 등록`} />
          <Metric label="COMPLETED" value={percent(data.coverage.completedRatio)} note={`${data.coverage.completedTrackCount.toLocaleString("ko-KR")}곡 완료`} />
          <Metric label="최근 24시간" value={data.throughput.completedLast24Hours.toLocaleString("ko-KR")} note="완료 처리량" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statuses.map((item) => <button type="button" onClick={() => { setStatus(item); setPage(1); }} className="hud-card rounded-xl p-4 text-left hover:border-hud-accent-primary" key={item}><StatusBadge status={item} /><p className="mt-3 font-mono text-xl">{data.statusCounts[item].toLocaleString("ko-KR")}</p></button>)}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2" aria-label="버전별 완료 현황">
        <article className="hud-card min-w-0 rounded-2xl p-5">
          <div className="flex items-center gap-2"><AudioWaveform size={19} className="text-hud-accent-primary" /><h2 className="font-semibold">Feature version</h2></div>
          <div className="mt-4 space-y-3">{data.featureVersions.map((item) => <div className="flex min-w-0 justify-between gap-3 text-sm" key={item.featureVersion}><span className="min-w-0 break-all font-mono text-hud-text-secondary">{item.featureVersion}</span><strong>{item.completedTrackCount.toLocaleString("ko-KR")}</strong></div>)}{data.featureVersions.length === 0 && <p className="text-sm text-hud-text-muted">완료된 feature가 없습니다.</p>}</div>
        </article>
        <article className="hud-card min-w-0 rounded-2xl p-5">
          <div className="flex items-center gap-2"><Database size={19} className="text-hud-accent-primary" /><h2 className="font-semibold">Embedding model version</h2></div>
          <div className="mt-4 space-y-3">{data.embeddingModelVersions.map((item) => <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm" key={`${item.modelId}:${item.modelRevision}`}><span className="min-w-0 break-all font-mono text-hud-text-secondary">{item.modelId}@{item.modelRevision}</span><span className="text-right"><strong>{item.completedTrackCount.toLocaleString("ko-KR")}</strong><br /><span className="text-xs text-hud-text-muted">{item.dimensions} dims</span></span></div>)}{data.embeddingModelVersions.length === 0 && <p className="text-sm text-hud-text-muted">완료된 embedding이 없습니다.</p>}</div>
        </article>
        <article className="hud-card min-w-0 rounded-2xl p-5">
          <h2 className="font-semibold">Prediction model version</h2>
          <div className="mt-4 max-h-64 space-y-3 overflow-y-auto">{data.predictionModelVersions.map((item) => <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm" key={`${item.modelId}:${item.modelRevision}:${item.vocabularyVersion}`}><span className="min-w-0 break-all font-mono text-hud-text-secondary">{item.modelId}@{item.modelRevision}<br /><span className="text-xs">{item.vocabularyVersion}</span></span><strong>{item.completedTrackCount.toLocaleString("ko-KR")}</strong></div>)}{data.predictionModelVersions.length === 0 && <p className="text-sm text-hud-text-muted">완료된 prediction이 없습니다.</p>}</div>
        </article>
        <article className="hud-card min-w-0 rounded-2xl p-5">
          <h2 className="font-semibold">Retry · terminal error</h2>
          <div className="mt-4 space-y-3">{data.errorCodes.map((item) => <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm" key={`${item.status}:${item.code}`}><StatusBadge status={item.status} /><code className="min-w-0 break-all text-hud-text-secondary">{item.code}</code><strong>{item.count.toLocaleString("ko-KR")}</strong></div>)}{data.errorCodes.length === 0 && <p className="text-sm text-hud-text-muted">retry·terminal 오류가 없습니다.</p>}</div>
        </article>
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        <article className="hud-card min-w-0 rounded-2xl p-5"><h2 className="font-semibold">최근 7일 완료량</h2><div className="mt-4 grid grid-cols-7 gap-2">{data.throughput.days.map((item) => <div className="min-w-0 rounded-lg bg-hud-bg-primary p-2 text-center" key={item.date}><p className="truncate text-xs text-hud-text-muted">{item.date.slice(5)}</p><p className="mt-2 font-mono text-lg">{item.completedCount}</p></div>)}</div></article>
        <article className="hud-card min-w-0 rounded-2xl p-5"><h2 className="font-semibold">모델 benchmark 표본</h2>{data.benchmarks.map((item) => <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm" key={item.source}><dt className="text-hud-text-secondary">환경</dt><dd className="text-right">{item.environment}</dd><dt className="text-hud-text-secondary">입력</dt><dd className="max-w-[18rem] text-right">{item.input}</dd><dt className="text-hud-text-secondary">Cold / warm</dt><dd className="font-mono">{item.coldLatencySeconds}s / {item.warmLatencySeconds}s</dd><dt className="text-hud-text-secondary">Peak RSS</dt><dd className="font-mono">{item.peakRssGib} GiB</dd><dt className="text-hud-text-secondary">근거</dt><dd className="max-w-[18rem] break-all text-right font-mono text-xs">{item.source}</dd></dl>)}</article>
      </section>

      <section className="hud-card min-w-0 overflow-hidden rounded-2xl" aria-labelledby="tracks-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hud-border-secondary px-5 py-4"><div><h2 id="tracks-title" className="font-semibold">트랙별 분석</h2><p className="mt-1 text-xs text-hud-text-muted">{data.tracks.totalCount.toLocaleString("ko-KR")}곡 · {data.tracks.page}페이지</p></div>{loading && <span className="text-xs text-hud-text-muted">갱신 중…</span>}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="border-b border-hud-border-secondary text-xs uppercase tracking-wider text-hud-text-muted"><tr><th className="px-5 py-4">트랙</th><th className="px-5 py-4">상태</th><th className="px-5 py-4">Version</th><th className="px-5 py-4">Duration</th><th className="px-5 py-4">Dimensions</th><th className="px-5 py-4">오류</th><th className="px-5 py-4">상세</th></tr></thead><tbody>
          {data.tracks.items.map((track) => <tr className="border-b border-hud-border-secondary/70 last:border-0" key={track.id}><td className="px-5 py-4"><p className="font-medium">{track.title}</p><p className="mt-1 text-xs text-hud-text-muted">{track.artist} · {track.album ?? "Unknown Album"}</p></td><td className="px-5 py-4"><StatusBadge status={track.status} /></td><td className="max-w-48 break-all px-5 py-4 font-mono text-xs">{track.featureVersion ?? "—"}</td><td className="px-5 py-4 font-mono">{track.durationSeconds === null ? "—" : `${track.durationSeconds.toFixed(3)}s`}</td><td className="px-5 py-4 font-mono">{track.dimensions ?? "—"}</td><td className="max-w-44 break-all px-5 py-4 text-xs text-hud-accent-danger">{track.lastErrorCode ?? "—"}</td><td className="px-5 py-4"><button type="button" onClick={() => { void openTrack(track.id); }} className="rounded-lg border border-hud-border-secondary px-3 py-2 hover:bg-hud-bg-hover">보기</button></td></tr>)}
          {!loading && data.tracks.items.length === 0 && <tr><td className="px-5 py-8 text-center text-hud-text-muted" colSpan={7}>조건에 맞는 트랙이 없습니다.</td></tr>}
        </tbody></table></div>
        <div className="flex items-center justify-end gap-2 border-t border-hud-border-secondary px-5 py-4"><button type="button" disabled={data.tracks.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-hud-border-secondary px-3 py-2 text-sm disabled:opacity-40">이전</button><button type="button" disabled={data.tracks.nextPage === null} onClick={() => setPage(data.tracks.nextPage ?? page)} className="rounded-lg border border-hud-border-secondary px-3 py-2 text-sm disabled:opacity-40">다음</button></div>
      </section>
    </>}

    {detailLoading && <div className="hud-card rounded-2xl p-5 text-sm text-hud-text-secondary">트랙 분석 상세를 불러오는 중입니다.</div>}
    {detail && !detailLoading && <section className="hud-card min-w-0 rounded-2xl p-5 sm:p-6" aria-labelledby="detail-title">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs uppercase tracking-[0.18em] text-hud-accent-primary">TRACK DETAIL</p><h2 id="detail-title" className="mt-1 text-xl font-semibold">{detail.title}</h2><p className="mt-1 text-sm text-hud-text-secondary">{detail.artist} · {detail.album ?? "Unknown Album"}</p></div><div className="flex gap-2"><button type="button" disabled={requeueing} onClick={() => { void requeue(); }} className="inline-flex items-center gap-2 rounded-xl border border-hud-accent-warning/50 px-3 py-2 text-sm text-hud-accent-warning disabled:opacity-50"><RotateCcw size={16} />{requeueing ? "등록 중" : `${FEATURE_VERSION} 재처리`}</button><button type="button" onClick={() => setDetail(null)} aria-label="트랙 상세 닫기" className="rounded-xl border border-hud-border-secondary p-2"><X size={18} /></button></div></div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-hud-text-muted">상태</dt><dd className="mt-1"><StatusBadge status={detail.status} /></dd></div><div><dt className="text-hud-text-muted">완료 시각</dt><dd className="mt-1">{dateTime(detail.completedAt)}</dd></div><div><dt className="text-hud-text-muted">시도</dt><dd className="mt-1 font-mono">{detail.attemptCount}</dd></div><div><dt className="text-hud-text-muted">오류</dt><dd className="mt-1 break-all font-mono text-xs">{detail.lastErrorCode ?? "—"}</dd></div></dl>
      <div className="mt-5 rounded-xl border border-hud-border-secondary bg-hud-bg-primary p-4"><p className="text-xs uppercase tracking-wider text-hud-text-muted">Preview SHA-256</p><p className="mt-2 break-all font-mono text-xs">{detail.previewHash ?? "—"}</p></div>
      {detail.feature ? <div className="mt-5 space-y-4"><div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5"><div><p className="text-hud-text-muted">Duration</p><p className="font-mono">{detail.feature.durationSeconds.toFixed(3)}s</p></div><div><p className="text-hud-text-muted">Sample rate</p><p className="font-mono">{detail.feature.sampleRate} Hz</p></div><div><p className="text-hud-text-muted">Channels</p><p className="font-mono">{detail.feature.channelCount}</p></div><div><p className="text-hud-text-muted">Segments</p><p className="font-mono">{detail.feature.segmentCount}</p></div><div><p className="text-hud-text-muted">Coverage</p><p className="font-mono">{percent(detail.feature.coverageRatio)}</p></div></div><div className="grid min-w-0 gap-4 xl:grid-cols-2"><article className="min-w-0"><h3 className="font-semibold">DSP feature</h3><pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-hud-bg-primary p-4 text-xs leading-5 text-hud-text-secondary">{json(detail.feature.dsp)}</pre></article><article className="min-w-0"><h3 className="font-semibold">Summary feature</h3><pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-hud-bg-primary p-4 text-xs leading-5 text-hud-text-secondary">{json(detail.feature.summary)}</pre></article></div></div> : <p className="mt-5 text-sm text-hud-text-muted">저장된 feature 결과가 없습니다.</p>}
      <div className="mt-6 grid min-w-0 gap-4 xl:grid-cols-2"><article className="min-w-0"><h3 className="font-semibold">Embedding metadata</h3><div className="mt-3 space-y-3">{detail.embeddings.map((item) => <div className="rounded-xl border border-hud-border-secondary p-3 text-sm" key={`${item.modelId}:${item.modelRevision}`}><p className="break-all font-mono text-xs">{item.modelId}@{item.modelRevision}</p><p className="mt-2 text-hud-text-secondary">{item.dimensions} dimensions · {item.normalization}</p></div>)}{detail.embeddings.length === 0 && <p className="text-sm text-hud-text-muted">저장된 embedding metadata가 없습니다.</p>}</div></article><article className="min-w-0"><h3 className="font-semibold">Prediction</h3><div className="mt-3 max-h-96 overflow-auto rounded-xl border border-hud-border-secondary"><table className="w-full min-w-[520px] text-left text-xs"><thead className="sticky top-0 bg-hud-bg-secondary text-hud-text-muted"><tr><th className="px-3 py-2">Model</th><th className="px-3 py-2">Label</th><th className="px-3 py-2">Probability</th></tr></thead><tbody>{detail.predictions.map((item) => <tr className="border-t border-hud-border-secondary" key={`${item.modelId}:${item.modelRevision}:${item.label}`}><td className="max-w-52 break-all px-3 py-2 font-mono">{item.modelId}@{item.modelRevision}</td><td className="px-3 py-2">{item.label}</td><td className="px-3 py-2 font-mono">{item.probability.toFixed(6)}</td></tr>)}</tbody></table></div></article></div>
    </section>}
  </div>;
}
