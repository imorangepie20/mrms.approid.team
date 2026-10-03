"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { TrackList } from "@/components/music/track-list";
import { TemplateConfirmDialog } from "@/components/ui/template-confirm-dialog";
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
  const [selectedTrackKeys, setSelectedTrackKeys] = useState(() => new Set<string>());
  const [pendingTrackKeys, setPendingTrackKeys] = useState(() => new Set<string>());
  const deletionInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const displayedTracks = batches.flatMap((batch) => batch.tracks
    .filter(({ track }) => !hiddenTrackKeys.has(`${batch.batchId}:${track.id}`))
    .map(({ track }) => ({ batchId: batch.batchId, trackId: track.id, title: track.title, key: `${batch.batchId}:${track.id}` })));
  const selectedTracks = displayedTracks.filter(({ key }) => selectedTrackKeys.has(key));
  const [confirmation, setConfirmation] = useState<{items: typeof displayedTracks; bulk: boolean} | null>(null);
  const deleting = pendingTrackKeys.size > 0;
  const allSelected = displayedTracks.length > 0 && selectedTracks.length === displayedTracks.length;

  const removeTracks = async (items: typeof displayedTracks, bulk: boolean) => {
    if (deletionInFlight.current || items.length === 0) return;
    deletionInFlight.current = true;
    setPendingTrackKeys(new Set(items.map(({ key }) => key)));
    setError(null);
    setNotice(null);
    setProgress({ done: 0, total: items.length });
    let removed = 0;
    const failed: typeof items = [];
    try {
      for (const [index, item] of items.entries()) {
        try {
          const response = await fetch("/api/recommendations/history", {
            body: JSON.stringify({ batchId: item.batchId, trackId: item.trackId }),
            headers: { "content-type": "application/json" },
            method: "DELETE",
          });
          if (!response.ok) throw new Error("history_track_removal_failed");
          removed += 1;
          setHiddenTrackKeys((current) => new Set(current).add(item.key));
          setSelectedTrackKeys((current) => { const next = new Set(current); next.delete(item.key); return next; });
        } catch {
          failed.push(item);
        }
        setProgress({ done: index + 1, total: items.length });
      }
      if (removed > 0) {
        setNotice(`${removed}곡을 추천 이력에서 삭제했습니다.`);
        router.refresh();
      }
      if (failed.length > 0) {
        setError(bulk
          ? `${failed.length}곡을 삭제하지 못했습니다. 실패한 곡은 선택 상태로 남아 있습니다. 잠시 후 다시 시도해 주세요.`
          : `“${failed[0].title}” 트랙을 추천 이력에서 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.`);
      }
    } finally {
      deletionInFlight.current = false;
      setPendingTrackKeys(new Set());
    }
  };

  const requestRemoval = (items: typeof displayedTracks, bulk: boolean) => {
    if (!deletionInFlight.current && !confirmation && items.length > 0) setConfirmation({items, bulk});
  };

  return (
    <div className="mt-7 grid gap-8">
      {confirmation ? <TemplateConfirmDialog title={confirmation.bulk ? `선택한 ${confirmation.items.length}곡을 삭제할까요?` : "이 곡을 삭제할까요?"} description={`${confirmation.bulk ? "선택한 곡" : `“${confirmation.items[0].title}” 곡`}을 추천 이력에서 삭제합니다. 삭제해도 다시 추천되지는 않습니다.`} onCancel={() => setConfirmation(null)} onConfirm={() => { const requested = confirmation; setConfirmation(null); void removeTracks(requested.items, requested.bulk); }} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3" id="history-selection-toolbar" tabIndex={-1}>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--foreground)]">
          <input
            aria-label="표시된 곡 전체 선택"
            checked={allSelected}
            className="size-4 accent-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            disabled={deleting || displayedTracks.length === 0}
            ref={(node) => { if (node) node.indeterminate = selectedTracks.length > 0 && !allSelected; }}
            type="checkbox"
            onChange={() => setSelectedTrackKeys(allSelected ? new Set() : new Set(displayedTracks.map(({ key }) => key)))}
          />
          표시된 곡 전체 선택
        </label>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-sm text-[var(--muted)]">선택 {selectedTracks.length}곡</span>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-400/30 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40" disabled={deleting || selectedTracks.length === 0} type="button" onClick={() => requestRemoval(selectedTracks, true)}>
            <Trash2 aria-hidden="true" className="size-4" />{deleting ? "삭제 중…" : "선택 삭제"}
          </button>
        </div>
      </div>
      {deleting ? <p role="status">삭제 중 {progress.done}/{progress.total}곡</p> : notice ? <p role="status">{notice}</p> : null}
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
                mobileStacked
                renderLeading={(track) => {
                  const key = `${batch.batchId}:${track.id}`;
                  return <label className="flex min-h-10 w-full cursor-pointer items-center justify-center">
                    <input aria-label={`추천 이력 선택 ${track.title}`} checked={selectedTrackKeys.has(key)} className="size-4 accent-violet-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" disabled={deleting} type="checkbox" onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedTrackKeys((current) => { const next = new Set(current); if (checked) next.add(key); else next.delete(key); return next; });
                    }} />
                  </label>;
                }}
                emptyMessage={batch.status === "exhausted" && batch.tracks.length === 0 ? "이 batch에서 추천 후보가 소진되었습니다." : "이력에서 표시할 트랙이 없습니다."}
                renderActions={(track) => {
                  const trackKey = `${batch.batchId}:${track.id}`;
                  const pending = pendingTrackKeys.has(trackKey);
                  return (
                    <button
                      aria-label={`추천 이력에서 삭제 ${track.title}`}
                      className="inline-grid size-9 place-items-center rounded-full text-[var(--subtle)] transition-colors hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-50"
                      disabled={deleting}
                      title="추천 이력에서 삭제"
                      type="button"
                      onClick={() => requestRemoval([{ batchId: batch.batchId, trackId: track.id, title: track.title, key: trackKey }], false)}
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
