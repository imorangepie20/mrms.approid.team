"use client";

import Link from "next/link";

import { catalog } from "@/lib/music/fixtures";
import { ProtectedNotice } from "@/app/gms/page";
import { useMusicSession } from "@/providers/music-session-provider";

export default function MyMusicShelfPage() {
  const { isAuthenticated, musicState, restoreRejectedTrack } = useMusicSession();

  if (!isAuthenticated) {
    return <ProtectedNotice destination="MMS" />;
  }

  const mmsTracks = catalog.filter((track) => musicState.mmsTrackIds.includes(track.id));
  const excludedTracks = catalog.filter((track) =>
    musicState.rejectedTrackIds.includes(track.id),
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-fuchsia-300">MMS</p>
        <h1 className="mt-2 text-3xl font-black">나만의 Music Mix Shelf</h1>
        <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">담은 트랙</h2>
          {mmsTracks.length === 0 ? (
            <p className="mt-3 text-slate-300">
              아직 담은 음악이 없어요. <Link className="text-fuchsia-300 underline" href="/gms">GMS 추천</Link>에서 시작해 보세요.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {mmsTracks.map((track) => (
                <li key={track.id} className="py-3">
                  <p className="font-semibold">{track.title}</p>
                  <p className="text-sm text-slate-400">{track.artist}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">추천 제외 관리</h2>
          {excludedTracks.length === 0 ? (
            <p className="mt-3 text-slate-300">영구 제외한 트랙이 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {excludedTracks.map((track) => (
                <li key={track.id} className="flex items-center justify-between gap-4">
                  <span>{track.title}</span>
                  <button
                    className="min-h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold"
                    type="button"
                    onClick={() => restoreRejectedTrack(track.id)}
                  >
                    추천 제외 해제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
