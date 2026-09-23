import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { changeEmsSourceRoutine, getEmsSourceRoutines, type EmsSourceRoutine } from "../lib/api";
import { apiErrorMessage } from "../lib/ui";

const labels: Record<EmsSourceRoutine["key"], { title: string; role: string; interval: string }> = {
  tidal_editorial: { title: "TIDAL 에디토리얼", role: "공개 플레이리스트의 재생 가능곡 탐색", interval: "매일 재탐색" },
  musicbrainz_core: { title: "MusicBrainz core", role: "녹음·ISRC 신규 항목 확인", interval: "12시간마다 버전 확인" },
  musicbrainz_canonical: { title: "MusicBrainz canonical", role: "대표 녹음·발매 순위 갱신", interval: "24시간마다 버전 확인" },
};

const statusLabels: Record<string, string> = {
  idle: "대기", checking: "버전 확인", downloading: "다운로드", staging: "후보 준비",
  queued: "처리 대기", resolving: "후보 확인", failed: "오류",
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

export default function SourceRoutines() {
  const [routines, setRoutines] = useState<EmsSourceRoutine[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRoutines(await getEmsSourceRoutines());
      setLoaded(true);
      setError("");
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function act(key: EmsSourceRoutine["key"], action: "enable" | "disable" | "check_now") {
    setBusy(key);
    try {
      await changeEmsSourceRoutine(key, action);
      await refresh();
    } catch (reason: unknown) {
      setError(apiErrorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Sources</p>
        <h1 className="mt-2 text-3xl font-semibold">정기 수집</h1>
        <p className="mt-2 text-sm text-hud-text-secondary">새 버전과 새 플레이리스트를 확인해 중복을 제외하고 EMS에 추가합니다.</p>
      </div>
      <button type="button" onClick={() => { void refresh(); }} aria-label="루틴 새로고침" className="rounded-xl border border-hud-border-secondary p-3 text-hud-text-secondary hover:bg-hud-bg-hover"><RefreshCw size={18} /></button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-hud-accent-danger/40 bg-hud-accent-danger/10 px-4 py-3 text-sm text-hud-accent-danger">{error}</div>}

    <section aria-label="원천별 갱신 루틴" className="grid gap-4 xl:grid-cols-3">
      {routines.map((routine) => <article key={routine.key} className="hud-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{labels[routine.key].title}</h2><p className="mt-1 text-sm text-hud-text-secondary">{labels[routine.key].role}</p></div>
          <span className={`rounded-full px-2 py-1 text-xs ${routine.enabled ? "bg-hud-accent-success/15 text-hud-accent-success" : "bg-hud-bg-hover text-hud-text-muted"}`}>{routine.enabled ? statusLabels[routine.status] ?? routine.status : "중지"}</span>
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">주기</dt><dd>{labels[routine.key].interval}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">다음 확인</dt><dd className="text-right">{routine.enabled ? date(routine.nextCheckAt) : "중지"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">최근 확인</dt><dd className="text-right">{date(routine.lastCheckedAt)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">적용 버전</dt><dd className="max-w-[55%] break-all text-right font-mono text-xs">{routine.lastVersion ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">최근 성공</dt><dd className="text-right">{date(routine.lastSuccessAt)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">최근 후보</dt><dd>{routine.lastCandidateCount.toLocaleString("ko-KR")}</dd></div>
          {routine.currentRunId && <div className="flex justify-between gap-3"><dt className="text-hud-text-secondary">후보 처리</dt><dd>{routine.currentRunMatchedCount.toLocaleString("ko-KR")} 매칭 · {routine.currentRunPendingCount.toLocaleString("ko-KR")} 대기</dd></div>}
          {routine.errorCode && <div className="flex justify-between gap-3 text-hud-accent-danger"><dt>오류</dt><dd className="break-all text-right">{routine.errorCode}</dd></div>}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={busy === routine.key} onClick={() => { void act(routine.key, routine.enabled ? "disable" : "enable"); }} className="rounded-lg border border-hud-border-secondary px-3 py-2 text-sm hover:bg-hud-bg-hover disabled:opacity-50">{routine.enabled ? "정기 수집 중지" : "정기 수집 켜기"}</button>
          <button type="button" disabled={!routine.enabled || busy === routine.key} onClick={() => { void act(routine.key, "check_now"); }} className="rounded-lg border border-hud-border-secondary px-3 py-2 text-sm hover:bg-hud-bg-hover disabled:opacity-50">지금 확인</button>
        </div>
      </article>)}
      {loaded && routines.length === 0 && <p className="text-sm text-hud-text-muted">등록된 루틴이 없습니다.</p>}
    </section>

    <section className="hud-card rounded-2xl p-5 text-sm text-hud-text-secondary">
      <h2 className="font-semibold text-hud-text-primary">수집 흐름</h2>
      <p className="mt-2">MusicBrainz core와 canonical을 결합한 후보는 TIDAL에서 KR 재생 가능 여부를 확인한 뒤 활성화됩니다. 사용자 플레이리스트는 가져오기 직후 별도로 처리합니다.</p>
      <p className="mt-2">사용자 가져오기: 이벤트 기반 · 다음 예약 없음 · 개인 플레이리스트 데이터는 공용 갱신 후보와 분리</p>
      <Link to="/ems/ingestion" className="mt-3 inline-block text-hud-accent-primary underline underline-offset-4">실행 현황과 그래프 보기</Link>
    </section>
  </div>;
}
