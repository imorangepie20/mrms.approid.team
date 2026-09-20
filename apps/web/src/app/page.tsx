"use client";

import { useState } from "react";
import Link from "next/link";

import { SignInGate } from "@/components/auth/sign-in-gate";
import { MusicRail } from "@/components/music/music-rail";
import { catalog } from "@/lib/music/fixtures";

const rails = [
  {
    title: "최신곡",
    description: "지금 막 도착한 새로운 사운드",
    tracks: catalog,
  },
  {
    title: "최신 플레이리스트",
    description: "분위기별로 가볍게 시작하는 믹스",
    tracks: catalog.slice(1),
  },
  {
    title: "플랫폼별 플레이리스트",
    description: "다양한 스트리밍 소스에서 발견한 음악",
    tracks: [catalog[2], catalog[0], catalog[3]],
  },
  {
    title: "당신을 위한 추천",
    description: "TIDAL을 연결하면 더 정확해져요",
    tracks: catalog.slice(0, 3),
  },
  {
    title: "이어 듣기",
    description: "마지막으로 관심을 보인 음악",
    tracks: catalog.slice(2),
  },
];

export default function HomePage() {
  const [isSignInGateOpen, setIsSignInGateOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[var(--background)] text-slate-950">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-slate-950"
        href="#discovery"
      >
        콘텐츠로 건너뛰기
      </a>
      <header className="border-b border-[var(--border)] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-lg font-black tracking-tight text-slate-950">Music Pie</p>
          <button
            className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            type="button"
            onClick={() => setIsSignInGateOpen(true)}
          >
            TIDAL 연결
          </button>
        </div>
      </header>
      <div id="discovery" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-700 via-blue-600 to-sky-400 p-6 shadow-xl shadow-blue-200/70 sm:p-10">
          <p className="text-sm font-semibold tracking-[0.2em] text-blue-100">
            DISCOVER YOUR NEXT FAVORITE
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-black tracking-tight text-white sm:text-6xl">
            Music Pie
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-200 sm:text-lg">
            새 음악을 발견하고, 플레이리스트로 나만의 취향 지도를 완성하세요.
          </p>
          <button
            className="mt-7 min-h-11 rounded-xl bg-white px-5 font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            type="button"
            onClick={() => setIsSignInGateOpen(true)}
          >
            내 취향으로 시작하기
          </button>
          <Link
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-white/70 px-5 font-bold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            href="/ems"
          >
            공개 탐색 시작
          </Link>
        </section>

        {rails.map((rail) => (
          <MusicRail
            key={rail.title}
            {...rail}
            onRequestSignIn={() => setIsSignInGateOpen(true)}
          />
        ))}
      </div>
      <SignInGate
        isOpen={isSignInGateOpen}
        onClose={() => setIsSignInGateOpen(false)}
        connectHref="/onboarding"
      />
    </div>
  );
}
