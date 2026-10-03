"use client";

import { CheckCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// UiModalNotification.tsx의 success toast를 Web 토큰에 맞춰 재사용한다.
export function MmsAddedAlert({ title, onClose }: { title: string; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), 5000);
    return () => window.clearTimeout(timer);
  }, [title]);

  return createPortal(
    <div className="fixed top-20 right-4 z-[100] max-w-[calc(100vw-2rem)] space-y-3 sm:right-6">
      <div aria-label="추가되었습니다" className="template-success-toast flex max-w-sm items-start gap-3 rounded-lg border border-[#10b981]/30 bg-[#10b981]/10 p-4 shadow-[0_0_30px_rgba(0,255,204,0.3)]" role="status">
        <CheckCircle aria-hidden="true" className="shrink-0 text-[#10b981]" size={20} />
        <div className="flex-1"><p className="text-sm text-[var(--foreground)]">추가되었습니다</p></div>
        <button aria-label="알림 닫기" className="-m-3 grid size-11 shrink-0 place-items-center text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]" onClick={onClose} type="button"><X aria-hidden="true" size={16} /></button>
      </div>
    </div>, document.body,
  );
}
