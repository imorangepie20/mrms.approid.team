import { ExternalLink, Pause, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AdminApiError,
  changeSpotifyChartRun,
  getSpotifyChartRuns,
  startSpotifyChartRun,
  type SpotifyChartAdminData,
  type SpotifyChartRun,
} from "../lib/api";

const statusLabel: Record<SpotifyChartRun["status"], string> = {
  pending: "대기",
  running: "실행 중",
  paused: "일시 중지",
  completed: "완료",
  failed: "실패",
};

const phaseLabel: Record<string, string> = {
  queued: "실행 대기",
  fetching: "Spotify 수집",
  resolving: "TIDAL 확인",
  waiting_for_retry: "재시도 대기",
  rate_limited: "요청 제한으로 중지",
  disk_wait: "디스크 점검 필요",
  request_budget_exhausted: "요청 예산 소진",
  paused: "사용자 중지",
  finished: "활성 전환 완료",
  failed: "실패",
};

function message(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.code === "spotify_chart_run_already_open") return "이미 진행 중이거나 일시 중지된 Spotify 실행이 있습니다.";
    if (error.code === "spotify_chart_transition_conflict") return "현재 상태에서는 이 작업을 실행할 수 없습니다.";
    return error.code;
  }
  return "Spotify 차트 상태를 불러오지 못했습니다.";
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "—";
}

export default function SpotifyCharts() {
  const [data, setData] = useState<SpotifyChartAdminData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await getSpotifyChartRuns());
      setError("");
    } catch (reason) {
      setError(message(reason));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openRun = useMemo(
    () => data?.runs.find((run) => ["pending", "running", "paused"].includes(run.status)),
    [data],
  );

  async function start() {
    setBusy("start");
    setError("");
    try {
      await startSpotifyChartRun();
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  }

  async function transition(run: SpotifyChartRun, action: "pause" | "resume") {
    setBusy(run.id);
    setError("");
    try {
      await changeSpotifyChartRun(run.id, action);
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.28em] text-hud-accent-primary">EMS / Spotify charts</p>
          <h1 className="mt-2 text-3xl font-semibold">Spotify 차트 가져오기</h1>
          <p className="mt-2 max-w-3xl text-sm text-hud-text-secondary">
            공개 차트 네 개를 수집하고 TIDAL KR 재생 가능 트랙만 EMS에 전시합니다.
          </p>
        </div>
        <button
          aria-label="Spotify 차트 상태 새로고침"
          className="rounded-lg border border-hud-border-secondary p-3 text-hud-text-secondary hover:bg-hud-bg-hover"
          type="button"
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} />
        </button>
      </header>

      {error ? (
        <p className="rounded-lg border border-hud-accent-danger/40 bg-hud-accent-danger/10 p-4 text-sm text-hud-accent-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="min-w-0 border-y border-hud-border-secondary py-5" aria-labelledby="spotify-targets-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="spotify-targets-heading">수집 대상</h2>
            <p className="mt-1 text-sm text-hud-text-secondary">
              Spotify {data?.limits.spotifyRequests ?? 4}회 · playlist당 {data?.limits.tracksPerPlaylist ?? 50}곡 · TIDAL 최대 {data?.limits.tidalRequests ?? 450}회
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg bg-hud-accent-primary px-4 py-2 text-sm font-semibold text-hud-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!data || Boolean(openRun) || busy !== null}
            type="button"
            onClick={() => void start()}
          >
            {busy === "start" ? "등록 중…" : "4개 차트 가져오기"}
          </button>
        </div>
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {(data?.targets ?? []).map((target, index) => (
            <article className="min-w-0 rounded-lg border border-hud-border-secondary p-4" key={target.id}>
              <p className="text-xs text-hud-text-muted">{String(index + 1).padStart(2, "0")}</p>
              <h3 className="mt-2 break-words font-semibold">{target.title}</h3>
              <p className="mt-1 break-words text-sm leading-6 text-hud-text-secondary">{target.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="min-w-0" aria-labelledby="spotify-runs-heading">
        <h2 className="text-lg font-semibold" id="spotify-runs-heading">실행 내역</h2>
        <div className="mt-4 space-y-4">
          {data?.runs.length ? data.runs.map((run) => (
            <RunRow busy={busy === run.id} key={run.id} run={run} onTransition={transition} />
          )) : (
            <p className="py-10 text-center text-sm text-hud-text-muted">아직 실행 내역이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function RunRow({
  busy,
  run,
  onTransition,
}: {
  busy: boolean;
  run: SpotifyChartRun;
  onTransition: (run: SpotifyChartRun, action: "pause" | "resume") => Promise<void>;
}) {
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-hud-border-secondary bg-hud-bg-secondary p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-hud-border-secondary px-2 py-1 text-xs">{statusLabel[run.status]}</span>
            {run.active ? <span className="text-xs font-medium text-hud-accent-primary">EMS 전시 중</span> : null}
          </div>
          <p className="mt-2 text-sm font-medium">{phaseLabel[run.phase] ?? run.phase}</p>
          <p className="mt-1 break-all font-mono text-xs text-hud-text-muted">{run.id}</p>
        </div>
        {run.status === "running" || run.status === "pending" ? (
          <button
            aria-label="Spotify 차트 실행 일시 중지"
            className="rounded-lg border border-hud-border-secondary p-2 hover:bg-hud-bg-hover disabled:opacity-50"
            disabled={busy}
            title="일시 중지"
            type="button"
            onClick={() => void onTransition(run, "pause")}
          >
            <Pause size={18} />
          </button>
        ) : run.status === "paused" ? (
          <button
            aria-label="Spotify 차트 실행 재개"
            className="rounded-lg border border-hud-border-secondary p-2 hover:bg-hud-bg-hover disabled:opacity-50"
            disabled={busy || run.tidalRequestCount >= run.tidalRequestBudget}
            title="재개"
            type="button"
            onClick={() => void onTransition(run, "resume")}
          >
            <Play size={18} />
          </button>
        ) : null}
      </header>

      <dl className="mt-5 grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 2xl:grid-cols-4">
        <Stat label="playlist" value={`${run.playlistCount} / 4`} />
        <Stat label="membership" value={`${run.membershipCount} / 200`} />
        <Stat label="matched" value={`${run.matchedCount} / ${run.requestedCount}`} />
        <Stat label="pending" value={String(run.pendingCount + run.retryableCount)} />
        <Stat label="ambiguous" value={String(run.ambiguousCount)} />
        <Stat label="not found" value={String(run.notFoundCount)} />
        <Stat label="unavailable" value={String(run.unavailableCount)} />
        <Stat label="requests" value={`Spotify ${run.spotifyRequestCount}/${run.spotifyRequestBudget} · TIDAL ${run.tidalRequestCount}/${run.tidalRequestBudget}`} />
      </dl>

      {run.playlists.length ? (
        <ul className="mt-5 divide-y divide-hud-border-secondary border-y border-hud-border-secondary">
          {run.playlists.map((playlist) => (
            <li className="flex min-w-0 items-center justify-between gap-4 py-3 text-sm" key={playlist.spotifyId}>
              <span className="min-w-0">
                <strong className="block truncate font-medium">{playlist.title}</strong>
                <span className="text-xs text-hud-text-muted">{playlist.matchedCount} / {playlist.sourceTrackCount}곡</span>
              </span>
              <a
                aria-label={`${playlist.title} Spotify 원문`}
                className="shrink-0 text-hud-text-secondary hover:text-hud-accent-primary"
                href={playlist.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
                title="Spotify 원문"
              >
                <ExternalLink size={16} />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-hud-text-muted">
        <span>등록 {dateTime(run.createdAt)}</span>
        <span>완료 {dateTime(run.finishedAt)}</span>
        {run.errorCode ? <span className="text-hud-accent-danger">오류 {run.errorCode}</span> : null}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-hud-border-secondary/70 pb-2">
      <dt className="shrink-0 text-hud-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
