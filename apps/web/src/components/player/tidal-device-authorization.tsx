"use client";

import { useEffect, useRef, useState } from "react";

type Authorization = {
  deviceCode: string;
  expiresAt: string;
  intervalSeconds: number;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
};

export function TidalDeviceAuthorization({
  fetcher = fetch,
  onConnected,
}: {
  fetcher?: typeof fetch;
  onConnected?: () => void;
}) {
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "starting" | "pending" | "connected">("idle");
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  const poll = async (next: Authorization, delaySeconds: number) => {
    timeoutRef.current = window.setTimeout(async () => {
      try {
        const response = await fetcher("/api/tidal/device-authorization/poll", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceCode: next.deviceCode }),
        });
        const body = await response.json() as { code?: string; status?: string };
        if (response.ok && body.status === "connected") {
          setStatus("connected");
          onConnected?.();
          return;
        }
        if (response.status === 202 && (body.status === "authorization_pending" || body.status === "slow_down")) {
          void poll(next, body.status === "slow_down" ? delaySeconds + 5 : delaySeconds);
          return;
        }
        throw new Error(body.code || "tidal_device_authorization_failed");
      } catch {
        setError("TIDAL 재생 연결에 실패했습니다.");
        setStatus("idle");
      }
    }, Math.max(0, delaySeconds) * 1000);
  };

  const start = async () => {
    setIsOpen(true);
    setStatus("starting");
    setError(null);
    try {
      const response = await fetcher("/api/tidal/device-authorization/start", { method: "POST" });
      if (!response.ok) throw new Error("tidal_device_authorization_failed");
      const next = await response.json() as Authorization;
      setAuthorization(next);
      setStatus("pending");
      void poll(next, next.intervalSeconds);
    } catch {
      setError("TIDAL 재생 연결을 시작하지 못했습니다.");
      setStatus("idle");
    }
  };

  const close = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setIsOpen(false);
  };

  return (
    <>
      <button className="min-h-10 rounded-full border border-cyan-300/30 px-3 text-xs font-bold text-cyan-100" type="button" onClick={() => void start()}>
        TIDAL 재생 연결
      </button>
      {isOpen ? (
        <div aria-label="TIDAL 재생 연결" aria-modal="true" className="fixed inset-0 z-60 grid place-items-center bg-black/75 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-6 text-white">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold tracking-[0.16em] text-cyan-300">TIDAL</p><h2 className="mt-2 text-xl font-semibold">전체 재생 연결</h2></div>
              <button aria-label="TIDAL 재생 연결 닫기" className="size-10 rounded-full hover:bg-white/10" type="button" onClick={close}>×</button>
            </div>
            {authorization ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-slate-300">아래 코드를 TIDAL 인증 화면에서 승인하세요.</p>
                <strong className="block text-center text-3xl tracking-[0.25em]">{authorization.userCode}</strong>
                <a className="block min-h-11 rounded-lg bg-cyan-300 px-4 py-3 text-center text-sm font-bold text-[#07151a]" href={authorization.verificationUriComplete || authorization.verificationUri} rel="noreferrer" target="_blank">TIDAL 인증 열기</a>
                <p aria-live="polite" className="text-center text-sm text-slate-400">{status === "connected" ? "연결 완료" : "승인 대기 중"}</p>
              </div>
            ) : <p className="mt-6 text-sm text-slate-300">연결 정보를 준비하는 중입니다.</p>}
            {error ? <p className="mt-4 text-sm text-red-300" role="alert">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
