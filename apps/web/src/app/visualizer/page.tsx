"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  VisualEqualizerCanvas,
  type VisualizerMode,
} from "@/components/player/visual-equalizer-canvas";
import { useTidalAudioAnalyser } from "@/hooks/use-tidal-audio-analyser";
import type { Track } from "@/lib/music/types";
import { useMusicSession } from "@/providers/music-session-provider";

function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function hasTidalTrackId(track: Track): track is Track & { tidalTrackId: string } {
  return "tidalTrackId" in track && typeof track.tidalTrackId === "string" && track.tidalTrackId.length > 0;
}

function analyserStatus(
  mode: ReturnType<typeof useTidalAudioAnalyser>["mode"],
  isPlaying: boolean,
  playbackError: string | null,
) {
  if (playbackError === "unauthorized") return "로그인 후 실시간 이퀄라이저를 사용할 수 있습니다.";
  if (playbackError === "tidal_device_authorization_required" || playbackError === "tidal_stream_scope_required") {
    return "TIDAL 재생 연결이 필요합니다.";
  }
  if (playbackError) return "현재 트랙을 재생하지 못했습니다.";
  if (mode === "unsupported") return "이 브라우저에서는 실시간 신호 분석을 지원하지 않습니다.";
  if (mode === "error") return "이 스트림의 오디오 신호를 분석하지 못했습니다.";
  if (mode === "waiting") return "오디오 신호를 준비하고 있습니다.";
  if (mode === "pcm" && !isPlaying) return "재생을 시작하면 이퀄라이저가 움직입니다.";
  if (mode === "pcm") return "실시간 오디오 신호 분석 중";
  return "재생할 트랙을 기다리고 있습니다.";
}

export default function VisualizerPage() {
  const router = useRouter();
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<VisualizerMode>("bars");
  const {
    currentIndex,
    currentTrack,
    durationSeconds,
    isPlaying,
    nextTrack,
    playbackError,
    playbackPosition,
    playQueueIndex,
    previousTrack,
    queue,
    seek,
    togglePlayback,
  } = useMusicSession();
  const analyser = useTidalAudioAnalyser(isPlaying);

  useEffect(() => {
    if (!currentTrack || !hasTidalTrackId(currentTrack)) router.replace("/");
  }, [currentTrack, router]);

  if (!currentTrack || !hasTidalTrackId(currentTrack)) return null;
  const hasArtwork = Boolean(currentTrack.artworkUrl) && failedArtworkUrl !== currentTrack.artworkUrl;
  const canPrevious = currentIndex !== null && currentIndex > 0;
  const canNext = currentIndex !== null && currentIndex < queue.length - 1;

  return (
    <div className="visualizer-shell" data-analyser-mode={analyser.mode}>
      <aside aria-label="재생 대기열" className="visualizer-queue">
        <div className="visualizer-queue-heading">
          <strong>UP NEXT</strong>
          <span>{queue.length}곡</span>
        </div>
        <ol>
          {queue.map((item, index) => (
            <li key={item.referenceId}>
              <button
                aria-current={index === currentIndex ? "true" : undefined}
                aria-label={`${item.track.title} 재생`}
                type="button"
                onClick={() => void playQueueIndex(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{item.track.title}</strong>
                  <small>{item.track.artist}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <main className="visualizer-main">
        <div className="visualizer-background" aria-hidden="true">
          {hasArtwork ? (
            <Image
              alt=""
              fill
              priority
              sizes="100vw"
              src={currentTrack.artworkUrl}
              onError={() => setFailedArtworkUrl(currentTrack.artworkUrl)}
            />
          ) : null}
        </div>
        <header className="visualizer-header">
          <button aria-label="이퀄라이저 닫기" className="visualizer-icon-button" type="button" onClick={() => router.back()}>
            ←
          </button>
          <div aria-label="이퀄라이저 표시 방식" className="visualizer-mode-switch" role="group">
            <button aria-pressed={mode === "bars"} type="button" onClick={() => setMode("bars")}>막대</button>
            <button aria-pressed={mode === "radial"} type="button" onClick={() => setMode("radial")}>방사형</button>
          </div>
          <span className="visualizer-live-label">VISUAL EQ</span>
        </header>

        <section aria-labelledby="visualizer-track-title" className="visualizer-stage">
          <div className={`visualizer-artwork bg-gradient-to-br ${currentTrack.artworkClass}`}>
            {hasArtwork ? (
              <Image
                alt={`${currentTrack.title} 앨범 아트`}
                fill
                priority
                sizes="(max-width: 760px) 58vw, 38vw"
                src={currentTrack.artworkUrl}
                onError={() => setFailedArtworkUrl(currentTrack.artworkUrl)}
              />
            ) : <span>MUSIC PIE</span>}
          </div>
          <VisualEqualizerCanvas analyser={analyser} mode={mode} />
          <div className="visualizer-track-copy">
            <h1 id="visualizer-track-title">{currentTrack.title}</h1>
            <p>{currentTrack.artist}</p>
            <span role="status">{analyserStatus(analyser.mode, isPlaying, playbackError)}</span>
            {playbackError === "unauthorized" ? (
              <Link className="visualizer-login-link" href="/api/auth/login?returnTo=%2Fvisualizer">
                로그인 후 재생
              </Link>
            ) : null}
          </div>
        </section>

        <footer className="visualizer-controls">
          <div className="visualizer-progress">
            <span>{formatTime(playbackPosition)}</span>
            <input
              aria-label="재생 위치"
              max={durationSeconds || 0}
              min="0"
              type="range"
              value={playbackPosition}
              onChange={(event) => void seek(Number(event.target.value))}
            />
            <span>{formatTime(durationSeconds)}</span>
          </div>
          <div className="visualizer-playback-buttons">
            <button aria-label="이전 트랙" disabled={!canPrevious} type="button" onClick={() => void previousTrack()}>‹</button>
            <button aria-label={isPlaying ? "일시 정지" : "재생"} className="visualizer-play-button" type="button" onClick={() => void togglePlayback()}>{isPlaying ? "Ⅱ" : "▶"}</button>
            <button aria-label="다음 트랙" disabled={!canNext} type="button" onClick={() => void nextTrack()}>›</button>
          </div>
        </footer>
      </main>
    </div>
  );
}
