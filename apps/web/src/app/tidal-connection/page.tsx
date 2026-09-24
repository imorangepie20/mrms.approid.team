import Link from "next/link";
import { redirect } from "next/navigation";

import { auth0 } from "@/lib/auth/auth0";
import { getUserConnection } from "@/lib/db/user-connections";

function safeReturnTo(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  const url = new URL(value, "https://music-pie.invalid");
  if (url.origin !== "https://music-pie.invalid" || url.pathname === "/tidal-connection" || url.pathname.startsWith("/api/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

export default async function TidalConnectionPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const session = await auth0.getSession();
  if (!session?.user.sub) redirect("/api/auth/login?returnTo=/tidal-connection");

  const connection = await getUserConnection(session.user.sub);
  const connected = connection?.status === "connected";
  const returnTo = safeReturnTo((await searchParams).returnTo);

  return (
    <main className="dashboard-page onboarding-page min-h-screen text-slate-100">
      <header className="space-title">TIDAL 연결<small>CONNECTION</small></header>
      <section className="mx-auto mt-12 max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 sm:p-10">
        <p className="text-sm font-semibold tracking-[0.18em] text-fuchsia-300">MUSIC PIE</p>
        <h1 className="onboarding-title mt-3">TIDAL 연결 확인</h1>
        <p className="mt-4 leading-7 text-slate-300">
          {connected
            ? "TIDAL 계정이 연결되어 있습니다. 음악 화면으로 계속할 수 있습니다."
            : "TIDAL을 연결하면 플레이리스트를 가져와 개인 음악 공간과 추천에 사용할 수 있습니다."}
        </p>
        <strong className="mt-6 block text-lg text-white" role="status">
          {connected ? "TIDAL 연결됨" : connection?.status === "reauthentication_required" ? "TIDAL 재연결 필요" : "TIDAL 연결 필요"}
        </strong>
        <div className="mt-8 flex flex-wrap gap-3">
          {connected ? (
            <Link className="onboarding-primary-action inline-flex min-h-11 items-center rounded-xl bg-[var(--brand)] px-5 font-bold text-[#111118]" href={returnTo}>
              음악 화면으로 계속
            </Link>
          ) : (
            <a className="onboarding-primary-action inline-flex min-h-11 items-center rounded-xl bg-[var(--brand)] px-5 font-bold text-[#111118]" href="/api/tidal/connect">
              TIDAL 연결하기
            </a>
          )}
          {connected ? (
            <Link className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-5" href="/onboarding">플레이리스트 가져오기</Link>
          ) : (
            <Link className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-5" href={returnTo}>나중에 연결하고 계속</Link>
          )}
        </div>
      </section>
    </main>
  );
}
