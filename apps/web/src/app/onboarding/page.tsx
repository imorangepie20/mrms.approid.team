"use client";

import { TidalOnboarding } from "@/components/onboarding/tidal-onboarding";

export default function OnboardingPage() {
  return (
    <main className="dashboard-page onboarding-page min-h-screen text-slate-100">
      <header className="space-title">Start your space<small>ONBOARDING</small></header>
      <div className="onboarding-layout">
        <section className="onboarding-intro">
          <p>PERSONAL MUSIC SPACE</p>
          <h1>당신의 음악으로 시작하는 공간</h1>
          <span>플레이리스트를 가져오면, 좋아하는 소리를 바탕으로 MMS와 첫 추천을 준비합니다.</span>
          <ol>
            <li><b>01</b><div><strong>TIDAL 연결</strong><small>허용한 범위 안에서만 음악 정보를 불러옵니다.</small></div></li>
            <li><b>02</b><div><strong>플레이리스트 선택</strong><small>개인 취향 분석에 사용할 음악을 고릅니다.</small></div></li>
            <li><b>03</b><div><strong>첫 취향 지도</strong><small>MMS와 개인화된 추천을 시작합니다.</small></div></li>
          </ol>
        </section>
        <div className="onboarding-form">
          <TidalOnboarding connectHref="/api/tidal/connect" />
        </div>
      </div>
    </main>
  );
}
