"use client";

import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import type { LikeKey, LikeSnapshot } from "@/lib/likes/types";
import { useLikes } from "@/providers/likes-provider";

export function LikeButton({
  className = "",
  item,
  returnTo,
}: {
  className?: string;
  item: LikeKey & LikeSnapshot;
  returnTo?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLiked, isPending, toggle } = useLikes();
  const liked = isLiked(item);
  const pending = isPending(item);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      router.push(`/api/auth/login?returnTo=${encodeURIComponent(returnTo ?? pathname)}`);
      return;
    }
    void toggle(item);
  };

  return (
    <button
      aria-label={`${liked ? "좋아요 취소" : "좋아요"} ${item.title}`}
      aria-pressed={liked}
      className={`grid min-h-11 min-w-11 place-items-center rounded-full text-[var(--muted)] transition hover:bg-fuchsia-400/10 hover:text-fuchsia-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-wait disabled:opacity-60 ${liked ? "text-fuchsia-300" : ""} ${className}`}
      disabled={pending}
      type="button"
      onClick={handleClick}
    >
      <svg aria-hidden="true" className="size-5" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
      </svg>
    </button>
  );
}
