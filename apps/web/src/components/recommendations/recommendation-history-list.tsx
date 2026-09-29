"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const router = useRouter();
  const [hiddenTrackKeys, setHiddenTrackKeys] = useState(() => new Set<string>());
  const [pendingTrackKey, setPendingTrackKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const removeTrack = async (batchId: string, trackId: string, title: string) => {
    if (!window.confirm("이 곡을 추천 이력에서 삭제할까요? 삭제해도 다시 추천되지는 않습니다.")) return;
    const trackKey = `${batchId}:${trackId}`;
    setPendingTrackKey(trackKey);
    setError(null);
    try {
      const response = await fetch("/api/recommendations/history", {
        body: JSON.stringify({ batchId, trackId }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      if (!response.ok) throw new Error("history_track_removal_failed");
      setHiddenTrackKeys((current) => new Set(current).add(trackKey));
      router.refresh();
    } catch {
      setError(`“${title}” 트랙을 추천 이력에서 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.`);
    } finally {
      setPendingTrackKey(null);
    }
  };

  return (
    <div className="mt-7 grid gap-8">
      {error ? <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-200" role="alert">{error}</p> : null}
      {batches.map((batch) => {
        const visibleTracks = batch.tracks.filter(({ track }) => !hiddenTrackKeys.has(`${batch.batchId}:${track.id}`));
        const decisions = new Map(visibleTracks.map(({ decision, track }) => [track.id, decision]));
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
                emptyMessage={batch.status === "exhausted" && batch.tracks.length === 0 ? "이 batch에서 추천 후보가 소진되었습니다." : "이력에서 표시할 트랙이 없습니다."}
                renderActions={(track) => {
                  const trackKey = `${batch.batchId}:${track.id}`;
                  const pending = pendingTrackKey === trackKey;
                  return (
                    <button
                      aria-label={`추천 이력에서 삭제 ${track.title}`}
                      className="inline-grid size-9 place-items-center rounded-full text-[var(--subtle)] transition-colors hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-50"
                      disabled={pendingTrackKey !== null}
                      title="추천 이력에서 삭제"
                      type="button"
                      onClick={() => void removeTrack(batch.batchId, track.id, track.title)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      {pending ? <span className="sr-only"> 삭제 중</span> : null}
                    </button>
                  );
                }}
                renderMeta={(track) => {
                  const decision = decisions.get(track.id);
                  return (
                    <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${decision === "accept" ? "bg-violet-400/15 text-violet-200" : decision === "reject" ? "bg-rose-400/10 text-rose-200" : "bg-white/[0.04] text-[var(--subtle)]"}`}>
                      {decision ? decisionCopy[decision] : "결정 없음"}
                    </span>
                  );
                }}
                source={{ id: `gms-history-${batch.batchId}`, type: "gms" }}
                tracks={visibleTracks.map(({ track }) => track)}
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
