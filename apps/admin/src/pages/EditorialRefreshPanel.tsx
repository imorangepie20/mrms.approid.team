import { useCallback, useEffect, useRef, useState } from "react";
import { Description, Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { Check, RefreshCw } from "lucide-react";
import { AdminApiError, applyEditorialRefresh, getEditorialRefreshes, previewEditorialRefresh, type EditorialRefreshData } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const labels = { pending: "미리보기 대기", running: "최신 선곡 조회 중", ready: "미리보기 준비 완료", blocked: "곡 부족으로 적용 불가", applied: "적용 완료", failed: "미리보기 실패", expired: "만료된 미리보기" };
function date(value: string | null) { return value ? new Date(value).toLocaleString("ko-KR") : "—"; }
function errorMessage(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.code === "editorial_refresh_stale") return "미리보기 이후 선곡 목록이 바뀌었습니다. 새 미리보기를 만들어 주세요.";
    if (error.code === "editorial_refresh_track_unavailable") return "미리보기의 곡 중 재생할 수 없는 곡이 생겼습니다. 새 미리보기를 만들어 주세요.";
    if (error.code === "editorial_refresh_already_open") return "이미 최신 선곡을 조회하고 있습니다. 잠시 뒤 상태를 확인해 주세요.";
    if (error.code === "editorial_refresh_not_ready") return "적용 가능한 미리보기가 없거나 만료되었습니다. 새 미리보기를 만들어 주세요.";
  }
  return apiErrorMessage(error);
}

export default function EditorialRefreshPanel({ onApplied }: { onApplied: () => void }) {
  const [data, setData] = useState<EditorialRefreshData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    try { const next = await getEditorialRefreshes(); if (mounted.current) { setData(next); setFetchError(""); } }
    catch (reason) { if (mounted.current) setFetchError(errorMessage(reason)); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [refresh]);
  const job = data?.jobs[0];
  const loading = job?.status === "pending" || job?.status === "running";
  const canApply = job?.status === "ready" && job.preview.canApply === true
    && !!job.expiresAt && new Date(job.expiresAt).getTime() > Date.now();
  const count = job?.preview.sections?.reduce((sum, section) => sum + section.tracks.length, 0) ?? 0;

  async function preview() {
    setBusy(true); setError(""); setNotice("");
    try { await previewEditorialRefresh(); await refresh(); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function apply() {
    const id = confirmId;
    if (!id) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await applyEditorialRefresh(id);
      setConfirmId(null); setNotice("선곡이 홈과 EMS에 적용되었습니다.");
      await refresh(); onApplied();
    } catch (reason) { setConfirmId(null); setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <section className="hud-card min-w-0 rounded-2xl p-5 sm:p-6" aria-labelledby="editorial-refresh-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="editorial-refresh-title" className="text-xl font-semibold">홈·EMS 선곡 갱신</h2>
        <p className="mt-2 max-w-3xl text-sm text-hud-text-secondary">TIDAL 공개 편집 플레이리스트에서 EMS에 등록된 한국 재생 가능 곡을 고릅니다. 선곡을 적용하면 홈과 EMS 양쪽에 반영됩니다.</p>
        <p className="mt-1 text-xs text-hud-text-muted">마지막 선곡 갱신: {date(data?.lastRefreshedAt ?? null)} · 화면별 제목·설명·순서·노출 설정은 유지됩니다.</p>
      </div>
      <button type="button" disabled={busy || loading || !data} onClick={() => void preview()} className="inline-flex items-center gap-2 rounded-lg bg-hud-accent-primary px-4 py-2.5 text-sm font-semibold text-hud-bg-primary disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "조회 중…" : "갱신 미리보기"}</button>
    </div>
    <details className="mt-5 rounded-xl border border-hud-border-secondary px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">선곡 기준 보기</summary>
      <p className="mt-3 text-xs leading-6 text-hud-text-secondary">개인 취향과 멜론 수집 순서에 따른 추천이 아닙니다. ISRC가 있는 30초 이상의 곡을 대상으로 섹션당 최대 12곡을 고르고 중복을 제거합니다. 신곡의 최신 기준은 트랙 발매일이 아닌 플레이리스트 갱신 시각입니다.</p>
      <ul className="mt-3 space-y-3 text-sm">{data?.criteria.map((criterion) => <li key={criterion.slug}><strong>{criterion.title}</strong> <span className="text-hud-text-secondary">· {criterion.source}<br />{criterion.ranking}</span></li>)}</ul>
    </details>
    {(error || fetchError) && <p role="alert" className="mt-4 rounded-lg bg-hud-accent-danger/10 p-3 text-sm text-hud-accent-danger">{error || fetchError}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-hud-accent-success/10 p-3 text-sm text-hud-accent-success">{notice}</p>}
    {job && <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm font-semibold">{labels[job.status]} <span className="font-normal text-hud-text-muted">· {date(job.updatedAt)}</span></p>
        {job.status === "ready" && <button type="button" disabled={busy || !canApply} onClick={() => { setConfirmedCount(count); setConfirmId(job.id); }} className="rounded-lg border border-hud-accent-primary px-4 py-2 text-sm text-hud-accent-primary disabled:opacity-50">미리보기 적용</button>}
      </div>
      {job.status === "ready" && <p className="text-xs text-hud-text-muted">{date(job.expiresAt)}까지 적용 가능합니다. 새 미리보기를 만들면 이전 미리보기는 만료됩니다.</p>}
      {job.status === "blocked" && <p role="alert" className="text-sm text-hud-accent-warning">5개 섹션에 각각 6곡 이상이 필요합니다. 기존 선곡은 유지했습니다.</p>}
      {job.status === "failed" && <p role="alert" className="text-sm text-hud-accent-danger">최신 선곡을 조회하지 못했습니다. 기존 선곡은 유지했습니다. 잠시 뒤 다시 시도해 주세요.</p>}
      {job.preview.sections?.map((section) => <details key={section.slug} className="rounded-xl border border-hud-border-secondary p-4">
        <summary className="cursor-pointer text-sm"><strong>{section.title}</strong><span className="ml-2 text-hud-text-secondary">{section.currentCount} → {section.tracks.length}곡 · 추가 {section.addedCount} · 제외 {section.removedCount}</span></summary>
        <p className="mt-2 text-xs text-hud-text-muted">원본 후보 {section.discovered}곡 · 섹션 분류: {section.slug}</p>
        <ol className="mt-3 space-y-3 text-sm">{section.tracks.map((track) => <li key={track.id}><p>{track.title} <span className="text-hud-text-secondary">· {track.artist}</span></p><p className="text-xs text-hud-text-muted">원본: {track.sourcePlaylistName}</p></li>)}</ol>
      </details>)}
    </div>}
    <Dialog open={confirmId !== null} onClose={() => { if (!busy) setConfirmId(null); }} className="relative z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="hud-card hud-card-bottom w-full max-w-md rounded-xl">
          <div className="p-6"><DialogTitle className="text-xl font-semibold">홈·EMS 선곡을 적용할까요?</DialogTitle><Description className="mt-3 text-sm leading-6 text-hud-text-secondary">확인한 {confirmedCount}곡을 홈과 EMS의 공통 선곡으로 적용합니다. 두 화면의 제목·설명·순서·노출과 사용자 음악 데이터는 유지됩니다.</Description></div>
          <div className="flex gap-3 border-t border-hud-border-secondary p-5">
            <button data-autofocus disabled={busy} onClick={() => setConfirmId(null)} type="button" className="flex-1 rounded-lg border border-hud-border-secondary px-4 py-2.5 text-sm disabled:opacity-50">취소</button>
            <button disabled={busy} onClick={() => void apply()} type="button" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-hud-accent-primary px-4 py-2.5 text-sm font-semibold text-hud-bg-primary disabled:opacity-50"><Check size={16} />{busy ? "적용 중…" : "선곡 적용"}</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  </section>;
}
