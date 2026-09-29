import type { Metadata } from "next";
import Link from "next/link";

import { RecommendationHistoryList } from "@/components/recommendations/recommendation-history-list";
import { auth0 } from "@/lib/auth/auth0";
import { canUsePersonalization, type PersonalizationAccess } from "@/lib/auth/access-policy";
import { getPersonalizedRecommendationHistoryPage } from "@/lib/db/gms-recommendation-batches";
import { getUserConnection } from "@/lib/db/user-connections";

export const metadata: Metadata = {
  title: "추천 이력 | Music Pie",
};

export default async function GmsRecommendationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const session = await auth0.getSession();
  const page = parsePage((await searchParams).page);
  const connectionStatus = session && process.env.DATABASE_URL
    ? (await getUserConnection(session.user.sub))?.status ?? "not_connected"
    : "not_connected";
  const access: PersonalizationAccess = {
    connectionStatus,
    isAuthenticated: Boolean(session),
  };

  let history: Awaited<ReturnType<typeof getPersonalizedRecommendationHistoryPage>> | null = null;
  let historyError = false;
  if (session && process.env.DATABASE_URL && canUsePersonalization(access)) {
    try {
      history = await getPersonalizedRecommendationHistoryPage(session.user.sub, page, 10);
    } catch {
      historyError = true;
    }
  }

  return (
    <section className="dashboard-page">
      <header className="space-title">추천 이력<small>GMS HISTORY</small></header>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-5 border-b border-[var(--border)] pb-6">
        <div>
          <p className="mb-2 text-xs font-bold tracking-[0.14em] text-teal-300">YOUR RECOMMENDATION ARCHIVE</p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--foreground)]">지금까지 받은 추천</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">한 번 표시된 추천과 그 이후 내린 결정을 사용자별로 보관합니다.</p>
        </div>
        <Link className="inline-flex min-h-11 items-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)] no-underline hover:border-teal-300/40 hover:text-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" href="/gms">
          GMS로 돌아가기
        </Link>
      </div>

      {!canUsePersonalization(access) ? (
        <HistoryAccessGate access={access} />
      ) : historyError ? (
        <div className="empty-state" role="alert"><b>추천 이력을 불러오지 못했습니다.</b><p>잠시 후 다시 시도해 주세요.</p></div>
      ) : history && history.items.length > 0 ? (
        <>
          <div className="mt-6 flex items-baseline justify-between gap-4">
            <p className="text-sm text-[var(--muted)]">총 <b className="text-[var(--foreground)]">{history.totalCount}</b>회</p>
            <p className="text-xs text-[var(--subtle)]">최신 추천부터 표시</p>
          </div>
          <RecommendationHistoryList batches={history.items} />
          <HistoryPagination page={history.page} totalPages={history.totalPages} />
        </>
      ) : (
        <div className="empty-state"><b>아직 저장된 추천이 없습니다.</b><p>GMS에서 첫 추천을 받으면 이곳에 기록됩니다.</p><Link href="/gms">추천 받으러 가기</Link></div>
      )}
    </section>
  );
}

function HistoryAccessGate({ access }: { access: PersonalizationAccess }) {
  if (!access.isAuthenticated) {
    return <div className="empty-state"><b>로그인이 필요합니다.</b><p>추천 이력은 사용자별로 분리됩니다.</p><a href="/api/auth/login?returnTo=/gms/history">로그인하고 계속하기</a></div>;
  }
  const reconnect = access.connectionStatus === "reauthentication_required";
  const pending = access.connectionStatus === "authorization_pending";
  return <div className="empty-state"><b>{reconnect ? "TIDAL 재연결이 필요합니다." : pending ? "TIDAL 연결을 확인하고 있습니다." : "TIDAL 연결이 필요합니다."}</b><p>{reconnect ? "권한이 만료되었거나 철회되었습니다." : "플레이리스트 동의를 완료하면 추천 이력을 확인할 수 있습니다."}</p><Link href="/onboarding">{reconnect ? "TIDAL 다시 연결하기" : "TIDAL 연결하기"}</Link></div>;
}

function HistoryPagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="추천 이력 페이지" className="mt-8 flex items-center justify-center gap-3">
      {page > 1 ? <Link className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] no-underline" href={`/gms/history?page=${page - 1}`}>이전</Link> : <span aria-disabled="true" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--subtle)] opacity-50">이전</span>}
      <span className="px-2 text-sm tabular-nums text-[var(--muted)]">{page} / {totalPages}</span>
      {page < totalPages ? <Link className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] no-underline" href={`/gms/history?page=${page + 1}`}>다음</Link> : <span aria-disabled="true" className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--subtle)] opacity-50">다음</span>}
    </nav>
  );
}

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
