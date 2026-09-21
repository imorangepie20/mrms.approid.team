"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { LikeItem, LikeKey, LikeSnapshot } from "@/lib/likes/types";

type LikesContextValue = {
  error: string | null;
  isAuthenticated: boolean;
  isLiked: (key: LikeKey) => boolean;
  isPending: (key: LikeKey) => boolean;
  items: LikeItem[];
  toggle: (item: LikeKey & LikeSnapshot) => Promise<void>;
};

const LikesContext = createContext<LikesContextValue | null>(null);

function itemKey(item: LikeKey) {
  return `${item.entityType}:${item.source}:${item.sourceId}`;
}

export function LikesProvider({
  children,
  initialLikes,
  isAuthenticated,
}: {
  children: ReactNode;
  initialLikes: LikeItem[];
  isAuthenticated: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState(initialLikes);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());

  const isLiked = useCallback((key: LikeKey) => {
    const target = itemKey(key);
    return items.some((item) => itemKey(item) === target);
  }, [items]);

  const isPending = useCallback(
    (key: LikeKey) => pendingKeys.has(itemKey(key)),
    [pendingKeys],
  );

  const toggle = useCallback(async (item: LikeKey & LikeSnapshot) => {
    const key = itemKey(item);
    if (pendingKeys.has(key)) return;

    const previousItem = items.find((candidate) => itemKey(candidate) === key) ?? null;
    const wasLiked = Boolean(previousItem);
    const optimisticItem: LikeItem = {
      ...item,
      createdAt: previousItem?.createdAt ?? new Date().toISOString(),
    };

    setError(null);
    setPendingKeys((current) => new Set(current).add(key));
    setItems((current) => wasLiked
      ? current.filter((candidate) => itemKey(candidate) !== key)
      : [optimisticItem, ...current]);

    try {
      const path = [
        item.entityType,
        item.source,
        item.sourceId,
      ].map(encodeURIComponent).join("/");
      const response = await fetch(`/api/likes/${path}`, wasLiked
        ? { method: "DELETE" }
        : {
            body: JSON.stringify({
              artworkUrl: item.artworkUrl,
              metadata: item.metadata,
              subtitle: item.subtitle,
              title: item.title,
            }),
            headers: { "content-type": "application/json" },
            method: "PUT",
          });
      if (!response.ok) throw new Error("like_request_failed");

      if (!wasLiked) {
        const body = await response.json() as { item?: LikeItem };
        if (body.item) {
          setItems((current) => current.map((candidate) =>
            itemKey(candidate) === key ? body.item as LikeItem : candidate));
        }
      }
    } catch {
      setItems((current) => {
        const withoutTarget = current.filter((candidate) => itemKey(candidate) !== key);
        return previousItem ? [previousItem, ...withoutTarget] : withoutTarget;
      });
      setError(wasLiked
        ? "좋아요를 해제하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "좋아요를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, [items, pendingKeys]);

  const value = useMemo(() => ({
    error,
    isAuthenticated,
    isLiked,
    isPending,
    items,
    toggle,
  }), [error, isAuthenticated, isLiked, isPending, items, toggle]);

  return (
    <LikesContext.Provider value={value}>
      {children}
      {error ? <p className="sr-only" role="alert">{error}</p> : null}
    </LikesContext.Provider>
  );
}

export function useLikes() {
  const context = useContext(LikesContext);
  if (!context) throw new Error("useLikes must be used within LikesProvider");
  return context;
}
