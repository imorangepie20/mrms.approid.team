"use client";

import { useState } from "react";

type DisconnectResult = {
  playlistCount: number;
  status: "disconnected";
  trackCount: number;
};

export function TidalConnectionActions() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [result, setResult] = useState<DisconnectResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async () => {
    setError(null);
    setIsDisconnecting(true);
    try {
      const response = await fetch("/api/tidal/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("tidal_disconnect_failed");
      setResult((await response.json()) as DisconnectResult);
      setIsConfirming(false);
    } catch {
      setError("TIDAL 연결을 해제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (result) {
    return (
      <div>
        <p role="status">TIDAL 연결이 해제되었습니다. 플레이리스트 {result.playlistCount}개와 트랙 {result.trackCount}곡은 그대로 유지됩니다.</p>
        <a href="/onboarding">TIDAL 다시 연결하기</a>
      </div>
    );
  }

  return (
    <div>
      <p id="disconnect-description">
        저장한 음악과 MMS는 유지되고 이후 TIDAL 동기화만 중단됩니다.
      </p>
      <button
        aria-describedby="disconnect-description"
        type="button"
        onClick={() => setIsConfirming(true)}
      >
        TIDAL 연결 해제
      </button>
      {isConfirming ? (
        <div aria-modal="true" role="dialog" aria-labelledby="disconnect-title">
          <h3 id="disconnect-title">TIDAL 연결을 해제할까요?</h3>
          <p>저장한 음악과 MMS는 유지되고 이후 TIDAL 동기화만 중단됩니다.</p>
          <button type="button" onClick={() => setIsConfirming(false)}>
            취소
          </button>
          <button
            disabled={isDisconnecting}
            type="button"
            onClick={() => void disconnect()}
          >
            {isDisconnecting ? "연결 해제 중" : "연결 해제 확인"}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
