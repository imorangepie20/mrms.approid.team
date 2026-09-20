"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  enrichNextTrack,
  fetchPlaylistImportStatus,
  fetchTidalPlaylists,
  startPlaylistImport,
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

type Step = "connect" | "select" | "importing" | "complete";

const IMPORT_POLL_INTERVAL_MS = 750;
const ENRICHMENT_INTERVAL_MS = 1_100;

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
  const callbackConnected = useSuccessfulTidalCallback();
  const visibleStep = step === "connect" && callbackConnected ? "select" : step;
  const workflowAbort = useRef<AbortController | null>(null);
  const enrichmentAbort = useRef<AbortController | null>(null);

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

  const continueEnrichment = (pendingCount: number) => {
    if (pendingCount <= 0) return;
    const controller = new AbortController();
    enrichmentAbort.current?.abort();
    enrichmentAbort.current = controller;

    const processNext = async () => {
      try {
        const result = await enrichNextTrack(controller.signal);
        if (result.remaining > 0) {
          await delay(ENRICHMENT_INTERVAL_MS, controller.signal);
          await processNext();
        }
      } catch (enrichmentError) {
        if (!isAbortError(enrichmentError)) return;
      }
    };
    void processNext();
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
      setCompletedImport(status);
      setStep("complete");
      continueEnrichment(status.enrichmentPendingCount);
    } catch (importError) {
      if (!isAbortError(importError)) {
        setError("플레이리스트를 가져오지 못했습니다. 다시 시도해 주세요.");
        setStep("select");
      }
    }
  };

  if (visibleStep === "complete" && completedImport) {
    return (
      <section className="rounded-3xl border border-emerald-300/30 bg-emerald-400/10 p-6 text-white sm:p-10">
        <p className="text-sm font-semibold tracking-[0.18em] text-emerald-200">
          READY TO DISCOVER
        </p>
        <h1 className="onboarding-title mt-3">MMS와 첫 추천이 준비됐어요</h1>
        <p className="mt-3 max-w-xl leading-7 text-emerald-50/85">
          {completedImport.savedTrackCount}곡을 저장했습니다. 앨범 정보 보강은
          백그라운드에서 계속됩니다.
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
