"use client";

import { useState } from "react";

import type { Track } from "@/lib/music/types";
import { useMusicSession } from "@/providers/music-session-provider";

export function GatewayTrack({ track }: { track: Track }) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [wasRejected, setWasRejected] = useState(false);
  const [wasAccepted, setWasAccepted] = useState(false);
  const { acceptTrack, playTrack, rejectTrack, restoreRejectedTrack } = useMusicSession();

  if (wasRejected) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-slate-100">
        <p className="font-semibold">추천에서 제외했어요</p>
        <p className="mt-1 text-sm text-slate-400">
          이 트랙은 이후 추천 후보에 포함되지 않습니다.
        </p>
        <button
          className="mt-4 min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
          type="button"
          onClick={() => {
            restoreRejectedTrack(track.id);
            setWasRejected(false);
          }}
        >
          되돌리기
        </button>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-white">
      <div className={`h-32 rounded-xl bg-gradient-to-br ${track.artworkClass}`} />
      <h2 className="mt-4 text-xl font-bold">{track.title}</h2>
      <p className="mt-1 text-sm text-slate-400">
        {track.artist} · {track.album}
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          className="min-h-11 rounded-xl border border-white/20 px-4 font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
          type="button"
          onClick={() => playTrack(track)}
        >
          재생
        </button>
        <button
          className="min-h-11 rounded-xl bg-fuchsia-400 px-4 font-bold text-slate-950 transition hover:bg-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
          type="button"
          onClick={() => {
            acceptTrack(track.id);
            setWasAccepted(true);
          }}
        >
          MMS에 담기
        </button>
        <button
          className="min-h-11 rounded-xl border border-white/20 px-4 font-semibold transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
          type="button"
          onClick={() => setIsConfirmOpen(true)}
        >
          다시 추천하지 않기
        </button>
      </div>
      {wasAccepted ? (
        <p aria-live="polite" className="mt-4 text-sm text-emerald-300">
          MMS에 추가했어요
        </p>
      ) : null}
      {isConfirmOpen ? (
        <div
          aria-labelledby="permanent-exclusion-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"
          role="dialog"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h3 id="permanent-exclusion-title" className="text-xl font-bold">
              이 트랙을 영구 제외할까요?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              이 사용자에게만 적용되며, EMS 원본 카탈로그나 다른 사용자의 추천에는
              영향을 주지 않습니다.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                className="min-h-11 flex-1 rounded-xl bg-rose-400 px-4 font-bold text-slate-950"
                type="button"
                onClick={() => {
                  rejectTrack(track.id);
                  setIsConfirmOpen(false);
                  setWasRejected(true);
                }}
              >
                영구 제외 확인
              </button>
              <button
                className="min-h-11 flex-1 rounded-xl border border-white/20 px-4 font-semibold"
                type="button"
                onClick={() => setIsConfirmOpen(false)}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
