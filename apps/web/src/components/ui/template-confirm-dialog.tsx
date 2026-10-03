"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

// apps/admin/src/pages/ui/UiModalNotification.tsx의 Confirm Dialog.
export function TemplateConfirmDialog({ title, description, onCancel, onConfirm }: {
  title: string; description: string; onCancel: () => void; onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelCallback = useRef(onCancel);
  useEffect(() => { cancelCallback.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelCallback.current(); }
      if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === cancelRef.current) confirmRef.current?.focus();
        else cancelRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.hasAttribute("disabled")) previousFocus.focus();
      else document.getElementById("history-selection-toolbar")?.focus();
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <section aria-describedby={descriptionId} aria-labelledby={titleId} aria-modal="true" className="relative w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_0_20px_rgba(0,255,204,0.1)]" role="alertdialog">
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#ef4444]/10"><AlertTriangle aria-hidden="true" className="text-[#ef4444]" size={32} /></div>
          <h3 className="mb-2 text-lg font-semibold" id={titleId}>{title}</h3>
          <p className="break-words text-sm text-[var(--muted)]" id={descriptionId}>{description}</p>
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] p-5">
          <button className="min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" onClick={onCancel} ref={cancelRef} type="button">취소</button>
          <button className="min-h-11 flex-1 rounded-lg bg-[#ef4444] px-4 py-2 text-sm font-medium text-white hover:bg-[#ef4444]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" onClick={onConfirm} ref={confirmRef} type="button">삭제</button>
        </div>
      </section>
    </div>, document.body,
  );
}
