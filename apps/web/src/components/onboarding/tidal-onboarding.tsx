"use client";

import { useState, useSyncExternalStore } from "react";

const subscribeToLocation = () => () => {};

function useSuccessfulTidalCallback() {
  return useSyncExternalStore(
    subscribeToLocation,
    () => new URLSearchParams(window.location.search).get("tidal") === "connected",
    () => false,
  );
}

type TidalPlaylist = {
  id: string;
  name: string;
  trackCount: number;
};

type TidalOnboardingProps = {
  connectHref?: string;
  playlists: TidalPlaylist[];
  onConnect?: () => Promise<void>;
  onCreateMms?: (selectedPlaylistIds: string[]) => void;
};

export function TidalOnboarding({
  connectHref,
  playlists,
  onConnect = async () => {},
  onCreateMms = () => {},
}: TidalOnboardingProps) {
  const [step, setStep] = useState<"connect" | "select" | "complete">("connect");
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const callbackConnected = useSuccessfulTidalCallback();
  const visibleStep = step === "connect" && callbackConnected ? "select" : step;

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

  const createMms = () => {
    if (selectedPlaylistIds.length === 0) {
      setError("플레이리스트를 하나 이상 선택해 주세요.");
      return;
    }

    const usablePlaylistIds = playlists
      .filter(
        (playlist) =>
          selectedPlaylistIds.includes(playlist.id) && playlist.trackCount > 0,
      )
      .map((playlist) => playlist.id);

    if (usablePlaylistIds.length === 0) {
      setError("선택한 플레이리스트에 분석할 트랙이 없습니다.");
      return;
    }

    setError(null);
    onCreateMms(usablePlaylistIds);
    setStep("complete");
  };

  if (visibleStep === "complete") {
    return (
      <section className="rounded-3xl border border-emerald-300/30 bg-emerald-400/10 p-6 text-white sm:p-10">
        <p className="text-sm font-semibold tracking-[0.18em] text-emerald-200">
          READY TO DISCOVER
        </p>
        <h1 className="mt-3 text-3xl font-black">MMS와 첫 추천이 준비됐어요</h1>
        <p className="mt-3 max-w-xl leading-7 text-emerald-50/85">
          선택한 플레이리스트를 바탕으로 개인화 추천을 시작할 수 있습니다.
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
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            TIDAL과 내 음악을 연결해요
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-slate-300">
            연결 후 가져올 플레이리스트를 고르면 MMS와 첫 추천을 만들 수 있어요.
          </p>
          {error ? <p role="alert" className="mt-5 text-rose-300">{error}</p> : null}
          {connectHref ? (
            <a
              className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-fuchsia-400 px-5 font-bold text-slate-950 transition hover:bg-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
              href={connectHref}
            >
              TIDAL 연결하기
            </a>
          ) : (
            <button
              className="mt-7 min-h-11 rounded-xl bg-fuchsia-400 px-5 font-bold text-slate-950 transition hover:bg-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200 disabled:cursor-wait disabled:opacity-70"
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
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            취향을 담을 플레이리스트를 선택해요
          </h1>
          <p className="mt-4 leading-7 text-slate-300">
            선택한 항목만 개인 MMS의 초기 분석에 사용됩니다.
          </p>
          <fieldset className="mt-7 space-y-3">
            <legend className="sr-only">가져올 TIDAL 플레이리스트</legend>
            {playlists.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/20 p-4 text-slate-300">
                현재 선택할 플레이리스트가 없습니다. 연결 상태를 확인한 뒤 다시
                시도해 주세요.
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
          {error ? <p role="alert" className="mt-5 text-rose-300">{error}</p> : null}
          <button
            className="mt-7 min-h-11 rounded-xl bg-fuchsia-400 px-5 font-bold text-slate-950 transition hover:bg-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
            type="button"
            onClick={createMms}
          >
            MMS 만들기
          </button>
        </>
      )}
    </section>
  );
}
