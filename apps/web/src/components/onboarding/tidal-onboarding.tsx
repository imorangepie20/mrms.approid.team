"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  enrichNextTrack,
  fetchPlaylistImportStatus,
  fetchTidalPlaylists,
  processTasteAnalysis,
  startPlaylistImport,
  type AnalysisProgress,
  type PlaylistImportStatus,
} from "@/lib/tidal/client-api";
import type { TidalPlaylistSummary } from "@/lib/tidal/api";

const subscribeToLocation = () => () => {};

function useSuccessfulTidalCallback() {
  return useSyncExternalStore(
    subscribeToLocation,
    () =>
      new URLSearchParams(window.location.search).get("tidal") === "connected",
    () => false,
  );
}

type TidalOnboardingProps = {
  connectHref?: string;
  onConnect?: () => Promise<void>;
};

type Step =
  | "connect"
  | "select"
  | "importing"
  | "analyzing"
  | "analysisFailed"
  | "complete";

const IMPORT_POLL_INTERVAL_MS = 750;
const ENRICHMENT_INTERVAL_MS = 1_100;
const ANALYSIS_INTERVAL_MS = 250;
const MINIMUM_TASTE_TRACKS = 15;
const RECOMMENDED_TASTE_TRACKS = 30;
const MULTI_TASTE_TRACKS = 60;

function tasteReadiness(trackCount: number) {
  if (trackCount < MINIMUM_TASTE_TRACKS) {
    return {
      detail: `${MINIMUM_TASTE_TRACKS - trackCount}곡 더 선택해 주세요`,
      heading: "취향 분석을 시작하려면 최소 15곡이 필요해요",
    };
  }
  if (trackCount < RECOMMENDED_TASTE_TRACKS) {
    return {
      detail: `더 정확한 추천까지 ${RECOMMENDED_TASTE_TRACKS - trackCount}곡 남았어요`,
      heading: "최소 기준 15곡 달성",
    };
  }
  if (trackCount < MULTI_TASTE_TRACKS) {
    return {
      detail: "60곡부터 여러 음악 취향을 나누어 분석할 수 있어요",
      heading: "첫 추천을 만들기에 충분해요",
    };
  }
  return {
    detail: "최초 추천 준비가 충분해요",
    heading: "여러 음악 취향을 나누어 분석할 수 있어요",
  };
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function TidalOnboarding({
  connectHref,
  onConnect = async () => {},
}: TidalOnboardingProps) {
  const [step, setStep] = useState<Step>("connect");
  const [playlists, setPlaylists] = useState<TidalPlaylistSummary[] | null>(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [completedImport, setCompletedImport] =
    useState<PlaylistImportStatus | null>(null);
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgress | null>(null);
  const callbackConnected = useSuccessfulTidalCallback();
  const visibleStep = step === "connect" && callbackConnected ? "select" : step;
  const workflowAbort = useRef<AbortController | null>(null);
  const enrichmentAbort = useRef<AbortController | null>(null);
  const enrichmentRemaining = useRef(0);
  const selectedTrackCount = (playlists ?? []).reduce(
    (total, playlist) =>
      selectedPlaylistIds.includes(playlist.id)
        ? total + playlist.trackCount
        : total,
    0,
  );
  const readiness = tasteReadiness(selectedTrackCount);

  useEffect(() => {
    return () => {
      workflowAbort.current?.abort();
      enrichmentAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (visibleStep !== "select" || playlists !== null) return;
    const controller = new AbortController();
    workflowAbort.current = controller;

    void fetchTidalPlaylists(controller.signal)
      .then(setPlaylists)
      .catch((loadError: unknown) => {
        if (!isAbortError(loadError)) {
          setError("TIDAL 플레이리스트를 불러오지 못했습니다. 다시 시도해 주세요.");
        }
      });

    return () => controller.abort();
  }, [playlists, visibleStep]);

  const connect = async () => {
    setError(null);
    setIsConnecting(true);
    try {
      await onConnect();
      setStep("select");
    } catch {
      setError("연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsConnecting(false);
    }
  };

  const togglePlaylist = (playlistId: string) => {
    setSelectedPlaylistIds((ids) =>
      ids.includes(playlistId)
        ? ids.filter((id) => id !== playlistId)
        : [...ids, playlistId],
    );
    setError(null);
  };

  const continueAnalysis = (pendingCount: number) => {
    const controller = new AbortController();
    enrichmentAbort.current?.abort();
    enrichmentAbort.current = controller;
    enrichmentRemaining.current = pendingCount;
    setAnalysisProgress(null);
    setError(null);
    setStep("analyzing");

    const processRemaining = async () => {
      try {
        while (enrichmentRemaining.current > 0) {
          const result = await enrichNextTrack(controller.signal);
          enrichmentRemaining.current = result.remaining;
          if (result.remaining > 0) {
            await delay(ENRICHMENT_INTERVAL_MS, controller.signal);
          }
        }

        while (!controller.signal.aborted) {
          const result = await processTasteAnalysis(controller.signal);
          setAnalysisProgress(result);
          if (result.profileReady) {
            setStep("complete");
            return;
          }
          if (result.remaining === 0 && result.failedTrackCount > 0) {
            throw new Error("taste_analysis_failed");
          }
          await delay(ANALYSIS_INTERVAL_MS, controller.signal);
        }
      } catch (analysisError) {
        if (!isAbortError(analysisError)) {
          setError("MMS는 저장됐어요. 취향 분석을 다시 시도해 주세요.");
          setStep("analysisFailed");
        }
      }
    };
    void processRemaining();
  };

  const waitForImport = async (importId: string, signal: AbortSignal) => {
    while (!signal.aborted) {
      const status = await fetchPlaylistImportStatus(importId, signal);
      if (status.status === "completed") return status;
      if (status.status === "failed" || status.status === "failed_retryable") {
        throw new Error(status.errorCode ?? "playlist_import_failed");
      }
      await delay(IMPORT_POLL_INTERVAL_MS, signal);
    }
    throw new DOMException("Aborted", "AbortError");
  };

  const createMms = async () => {
    if (selectedPlaylistIds.length === 0) {
      setError("플레이리스트를 하나 이상 선택해 주세요.");
      return;
    }

    const controller = new AbortController();
    workflowAbort.current?.abort();
    workflowAbort.current = controller;
    setError(null);
    setStep("importing");

    try {
      const { importId } = await startPlaylistImport(
        selectedPlaylistIds,
        controller.signal,
      );
      const status = await waitForImport(importId, controller.signal);
      if (status.savedTrackCount === 0) {
        setError("선택한 플레이리스트에서 가져온 트랙이 없습니다.");
        setStep("select");
        return;
      }
      if (status.uniqueTrackCount < MINIMUM_TASTE_TRACKS) {
        setError(
          "취향 분석을 시작하려면 고유 트랙이 최소 15곡 필요해요. 플레이리스트를 더 선택해 주세요.",
        );
        setStep("select");
        return;
      }
      setCompletedImport(status);
      continueAnalysis(status.enrichmentPendingCount);
    } catch (importError) {
      if (!isAbortError(importError)) {
        setError("플레이리스트를 가져오지 못했습니다. 다시 시도해 주세요.");
        setStep("select");
      }
    }
  };

  if (
    completedImport
    && ["analyzing", "analysisFailed", "complete"].includes(visibleStep)
  ) {
    if (visibleStep === "analyzing") {
      return (
        <section className="rounded-3xl border border-fuchsia-300/30 bg-fuchsia-400/10 p-6 text-white sm:p-10">
          <p className="text-sm font-semibold tracking-[0.18em] text-fuchsia-200">
            BUILDING YOUR TASTE
          </p>
          <h1 className="onboarding-title mt-3">취향을 분석하고 있어요</h1>
          <p className="mt-3 max-w-xl leading-7 text-fuchsia-50/85" role="status">
            {analysisProgress
              ? `${analysisProgress.embeddedTrackCount}곡 분석 완료 · ${analysisProgress.remaining}곡 남음`
              : "앨범 정보를 보강한 뒤 취향 벡터를 만들고 있습니다."}
          </p>
        </section>
      );
    }

    if (visibleStep === "analysisFailed") {
      return (
        <section className="rounded-3xl border border-amber-300/30 bg-amber-400/10 p-6 text-white sm:p-10">
          <p className="text-sm font-semibold tracking-[0.18em] text-amber-200">
            MMS SAVED
          </p>
          <h1 className="onboarding-title mt-3">취향 분석을 이어갈 수 있어요</h1>
          <p className="mt-3 max-w-xl leading-7 text-amber-50/85" role="alert">
            {error}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-xl bg-white px-5 font-bold text-amber-950 transition hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              type="button"
              onClick={() => continueAnalysis(enrichmentRemaining.current)}
            >
              분석 다시 시도
            </button>
            <a
              className="inline-flex min-h-11 items-center rounded-xl border border-white/30 px-5 font-bold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              href="/mms"
            >
              MMS 보러 가기
            </a>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-3xl border border-emerald-300/30 bg-emerald-400/10 p-6 text-white sm:p-10">
        <p className="text-sm font-semibold tracking-[0.18em] text-emerald-200">
          READY TO DISCOVER
        </p>
        <h1 className="onboarding-title mt-3">MMS와 첫 추천이 준비됐어요</h1>
        <p className="mt-3 max-w-xl leading-7 text-emerald-50/85">
          {completedImport.savedTrackCount}곡을 저장했습니다. 중복 제거 후 고유 트랙은{" "}
          {completedImport.uniqueTrackCount}곡입니다. 취향 분석과 첫 추천 준비를 마쳤습니다.
        </p>
        <a
          className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-white px-5 font-bold text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          href="/gms"
        >
          추천 보러 가기
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 text-white sm:p-10">
      <p className="text-sm font-semibold tracking-[0.18em] text-fuchsia-300">
        {visibleStep === "connect" ? "STEP 1 OF 3" : "STEP 2 OF 3"}
      </p>
      {visibleStep === "connect" ? (
        <>
          <h1 className="onboarding-title mt-3">
            TIDAL과 내 음악을 연결해요
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-slate-300">
            연결 후 가져올 플레이리스트를 고르면 MMS와 첫 추천을 만들 수 있어요.
          </p>
          {error ? <p role="alert" className="mt-5 text-rose-300">{error}</p> : null}
          {connectHref ? (
            <a
              className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[var(--brand)] px-5 font-bold text-[#111118] transition hover:bg-[var(--brand-strong)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              href={connectHref}
            >
              TIDAL 연결하기
            </a>
          ) : (
            <button
              className="mt-7 min-h-11 rounded-xl bg-[var(--brand)] px-5 font-bold text-[#111118] transition hover:bg-[var(--brand-strong)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-70"
              disabled={isConnecting}
              type="button"
              onClick={connect}
            >
              {isConnecting ? "연결하는 중" : error ? "다시 시도" : "TIDAL 연결하기"}
            </button>
          )}
        </>
      ) : (
        <>
          <h1 className="onboarding-title mt-3">
            취향을 담을 플레이리스트를 선택해요
          </h1>
          <p className="mt-4 leading-7 text-slate-300">
            선택한 항목만 개인 MMS의 초기 분석에 사용됩니다.
          </p>
          <fieldset className="mt-7 space-y-3" disabled={visibleStep === "importing"}>
            <legend className="sr-only">가져올 TIDAL 플레이리스트</legend>
            {playlists === null ? (
              <p className="rounded-xl border border-dashed border-white/20 p-4 text-slate-300">
                플레이리스트를 불러오는 중입니다.
              </p>
            ) : playlists.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/20 p-4 text-slate-300">
                가져올 플레이리스트가 없습니다.
              </p>
            ) : (
              playlists.map((playlist) => (
                <label
                  key={playlist.id}
                  className="flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border border-white/10 p-4 transition hover:border-fuchsia-300/70"
                >
                  <input
                    checked={selectedPlaylistIds.includes(playlist.id)}
                    className="size-5 accent-fuchsia-400"
                    type="checkbox"
                    onChange={() => togglePlaylist(playlist.id)}
                  />
                  <span className="flex-1 font-semibold">{playlist.name}</span>
                  <span className="text-sm text-slate-400">{playlist.trackCount}곡</span>
                </label>
              ))
            )}
          </fieldset>
          {playlists && playlists.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/5 p-4">
              <p className="font-semibold">선택 예상 트랙 {selectedTrackCount}곡</p>
              <progress
                aria-label="첫 추천 권장 트랙 수"
                className="mt-3 h-2 w-full accent-fuchsia-400"
                max={RECOMMENDED_TASTE_TRACKS}
                value={Math.min(selectedTrackCount, RECOMMENDED_TASTE_TRACKS)}
              />
              <p className="mt-2 text-sm font-semibold text-fuchsia-200">
                {readiness.heading}
              </p>
              <p className="mt-1 text-sm text-slate-300">{readiness.detail}</p>
              <p className="mt-2 text-xs text-slate-400">
                플레이리스트 간 중복을 제거한 고유 트랙 수는 가져오기 후 확정됩니다.
              </p>
            </div>
          ) : null}
          {visibleStep === "importing" ? (
            <p className="mt-5 text-slate-300" role="status">
              선택한 음악을 저장하는 중입니다.
            </p>
          ) : null}
          {error ? <p role="alert" className="mt-5 text-rose-300">{error}</p> : null}
          <button
            className="mt-7 min-h-11 rounded-xl bg-[var(--brand)] px-5 font-bold text-[#111118] transition hover:bg-[var(--brand-strong)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-70"
            disabled={visibleStep === "importing"}
            type="button"
            onClick={() => void createMms()}
          >
            {visibleStep === "importing" ? "가져오는 중" : "MMS 만들기"}
          </button>
        </>
      )}
    </section>
  );
}
