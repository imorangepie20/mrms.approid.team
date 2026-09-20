"use client";

import { TidalOnboarding } from "@/components/onboarding/tidal-onboarding";
import { useMusicSession } from "@/providers/music-session-provider";

const tidalPlaylists = [
  { id: "tidal-night-walk", name: "밤 산책", trackCount: 24, trackIds: ["t-1", "t-3"] },
  { id: "tidal-morning-focus", name: "Morning Focus", trackCount: 38, trackIds: ["t-2", "t-4"] },
  { id: "tidal-weekend", name: "주말 드라이브", trackCount: 18, trackIds: ["t-1", "t-4"] },
];

export default function OnboardingPage() {
  const { connectTidal, initializeMms } = useMusicSession();

  return (
    <main className="dashboard-page min-h-screen text-slate-100">
      <div className="mx-auto max-w-3xl">
        <TidalOnboarding
          playlists={tidalPlaylists}
          onConnect={() => connectTidal()}
          onCreateMms={(selectedPlaylistIds) => {
            const initialTrackIds = tidalPlaylists
              .filter((playlist) => selectedPlaylistIds.includes(playlist.id))
              .flatMap((playlist) => playlist.trackIds);

            initializeMms(initialTrackIds);
          }}
        />
      </div>
    </main>
  );
}
