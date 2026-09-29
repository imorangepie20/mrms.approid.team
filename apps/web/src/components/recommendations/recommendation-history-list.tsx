"use client";

import { TrackList } from "@/components/music/track-list";
import type { RecommendationHistoryEntry } from "@/lib/db/gms-recommendation-batches";

const statusCopy = {
  current: "현재 추천",
  exhausted: "후보 소진",
  replaced: "지난 추천",
} as const;

const decisionCopy = {
  accept: "MMS로 보냄",
  reject: "싫어요",
  skip: "건너뜀",
} as const;

export function RecommendationHistoryList({ batches }: { batches: RecommendationHistoryEntry[] }) {
  return (
    <div className="mt-7 grid gap-8">
      {batches.map((batch) => {
        const decisions = new Map(batch.tracks.map(({ decision, track }) => [track.id, decision]));
        return (
          <article
            aria-labelledby={`recommendation-batch-${batch.batchId}`}
            className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
            key={batch.batchId}
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.12em] text-[var(--subtle)]">
                  {batch.rankingVersion === "hybrid-v0" ? "HYBRID RANKING" : "BASELINE RANKING"}
                </p>
                <h2 className="text-lg font-semibold text-[var(--foreground)]" id={`recommendation-batch-${batch.batchId}`}>
                  {formatDateTime(batch.createdAt)}
                </h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${batch.status === "current" ? "border-teal-400/35 bg-teal-400/10 text-teal-200" : "border-white/10 bg-white/[0.035] text-[var(--muted)]"}`}>
                {statusCopy[batch.status]}
              </span>
            </header>
            <div className="px-3 pb-3 sm:px-5 sm:pb-5">
              <TrackList
                emptyMessage={batch.status === "exhausted" ? "이 batch에서 추천 후보가 소진되었습니다." : "이 batch에 저장된 트랙이 없습니다."}
                renderMeta={(track) => {
                  const decision = decisions.get(track.id);
                  return (
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${decision === "accept" ? "bg-violet-400/15 text-violet-200" : decision === "reject" ? "bg-rose-400/10 text-rose-200" : "bg-white/[0.04] text-[var(--subtle)]"}`}>
                      {decision ? decisionCopy[decision] : "결정 없음"}
                    </span>
                  );
                }}
                source={{ id: `gms-history-${batch.batchId}`, type: "gms" }}
                tracks={batch.tracks.map(({ track }) => track)}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
