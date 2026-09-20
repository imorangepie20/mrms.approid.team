"use client";

import Link from "next/link";

import { GatewayTrack } from "@/components/music/preference-actions";
import { catalog } from "@/lib/music/fixtures";
import { getGatewayTracks } from "@/lib/music/recommendations";
import { useMusicSession } from "@/providers/music-session-provider";

export default function GatewayMusicPage() {
  const { isAuthenticated, musicState } = useMusicSession();

  if (!isAuthenticated) {
    return <ProtectedNotice destination="GMS 추천" />;
  }

  const tracks = getGatewayTracks(
    catalog,
    musicState.mmsTrackIds,
    musicState.rejectedTrackIds,
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-fuchsia-300">GMS</p>
        <h1 className="mt-2 text-3xl font-black">당신을 위한 추천</h1>
        <p className="mt-3 text-slate-300">마음에 드는 음악은 MMS에 담아 보세요.</p>
        {tracks.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-300">
            지금 남아 있는 추천이 없어요. MMS를 확인하거나 나중에 새 추천을 받아보세요.
          </p>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((track) => (
              <GatewayTrack key={track.id} track={track} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export function ProtectedNotice({ destination }: { destination: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-100">
      <section className="max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7">
        <h1 className="text-2xl font-black">{destination}은 개인화 기능이에요</h1>
        <p className="mt-3 leading-7 text-slate-300">
          TIDAL을 연결한 뒤 내 플레이리스트로 추천과 MMS를 만들 수 있습니다.
        </p>
        <Link
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-fuchsia-400 px-5 font-bold text-slate-950"
          href="/onboarding"
        >
          TIDAL 연결하기
        </Link>
      </section>
    </main>
  );
}
