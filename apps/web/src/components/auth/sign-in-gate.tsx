"use client";

import { useEffect, useRef } from "react";

type SignInGateProps = {
  isOpen: boolean;
  onClose: () => void;
  connectHref: string;
};

export function SignInGate({ isOpen, onClose, connectHref }: SignInGateProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/65 p-4 sm:place-items-center">
      <section
        aria-describedby="tidal-connect-description"
        aria-labelledby="tidal-connect-title"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-900 p-6 text-white shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-fuchsia-300">
              YOUR MUSIC, YOUR WAY
            </p>
            <h2 id="tidal-connect-title" className="mt-2 text-2xl font-bold">
              TIDAL 연결
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="로그인 안내 닫기"
            className="grid size-11 place-items-center rounded-full border border-white/20 text-xl transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p id="tidal-connect-description" className="mt-5 leading-7 text-slate-300">
          플레이리스트를 바탕으로 나만의 MMS를 만들고, 취향에 맞는 추천을
          받아보세요.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-fuchsia-400 px-5 font-semibold text-slate-950 transition hover:bg-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
            href={connectHref}
          >
            내 취향으로 추천받기
          </a>
          <button
            className="min-h-11 rounded-xl border border-white/20 px-5 font-medium text-slate-100 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
            type="button"
            onClick={onClose}
          >
            지금은 둘러볼게요
          </button>
        </div>
      </section>
    </div>
  );
}
