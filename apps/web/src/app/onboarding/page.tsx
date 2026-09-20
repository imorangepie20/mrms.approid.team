"use client";

import { TidalOnboarding } from "@/components/onboarding/tidal-onboarding";
import { useMusicSession } from "@/providers/music-session-provider";

const tidalPlaylists = [
  { id: "tidal-night-walk", name: "밤 산책", trackCount: 24 },
  { id: "tidal-morning-focus", name: "Morning Focus", trackCount: 38 },
  { id: "tidal-weekend", name: "주말 드라이브", trackCount: 18 },
];

export default function OnboardingPage() {
  const { connectTidal } = useMusicSession();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <TidalOnboarding
          playlists={tidalPlaylists}
          onConnect={() => connectTidal()}
        />
      </div>
    </main>
  );
}
