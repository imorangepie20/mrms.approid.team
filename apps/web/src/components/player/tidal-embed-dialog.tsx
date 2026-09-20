"use client";

import {
  tidalBrowseUrl,
  tidalEmbedUrl,
  type TidalResourceKind,
} from "@/lib/tidal/links";

type TidalEmbedDialogProps = {
  kind: TidalResourceKind;
  onClose: () => void;
  resourceId: string;
  title: string;
};

export function TidalEmbedDialog({
  kind,
  onClose,
  resourceId,
  title,
}: TidalEmbedDialogProps) {
  return (
    <div
      aria-label="TIDAL 플레이어"
      aria-modal="true"
      className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-[#08080d] shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-cyan-300">TIDAL</p>
            <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
          </div>
          <button
            aria-label="TIDAL 플레이어 닫기"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 text-xl text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <iframe
          allow="encrypted-media; clipboard-write; clipboard-read"
          className={kind === "track" ? "h-[120px] w-full" : "h-[min(70vh,640px)] w-full"}
          sandbox="allow-scripts allow-popups allow-forms allow-same-origin"
          src={tidalEmbedUrl(kind, resourceId)}
          title={`${title} TIDAL 플레이어`}
        />
        <footer className="flex justify-end border-t border-white/10 px-4 py-3 sm:px-5">
          <a
            className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            href={tidalBrowseUrl(kind, resourceId)}
            rel="noreferrer"
            target="_blank"
          >
            TIDAL에서 열기
          </a>
        </footer>
      </div>
    </div>
  );
}
