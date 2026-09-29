import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { RecommendationHistoryEntry } from "@/lib/db/gms-recommendation-batches";
import { LikesProvider } from "@/providers/likes-provider";

const musicSession = vi.hoisted(() => ({
  currentTrack: null,
  playbackStatus: "idle",
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => musicSession,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/gms/history",
  useRouter: () => router,
}));

import { RecommendationHistoryList } from "./recommendation-history-list";

const tracks = [
  {
    decidedAt: "2026-09-29T01:00:00.000Z",
    decision: "accept" as const,
    track: {
      album: "Discovery",
      artist: "Daft Punk",
      artworkClass: "from-violet-700 to-slate-900",
      artworkUrl: "",
      id: "track-a",
      playbackAvailable: true,
      recommendation: {
        rankingVersion: "hybrid-v0" as const,
        reasonCodes: ["taste_match"],
        score: 0.9,
        scoreComponents: {
          catalogPriority: 0.8,
          diversity: 1,
          freshness: 0.7,
          matchConfidence: 0.9,
          similarity: 0.9,
        },
      },
      tidalTrackId: "tidal-a",
      title: "One More Time",
    },
  },
  {
    decidedAt: null,
    decision: null,
    track: {
      album: "Random Access Memories",
      artist: "Daft Punk",
      artworkClass: "from-amber-700 to-slate-900",
      artworkUrl: "",
      id: "track-b",
      playbackAvailable: true,
      recommendation: {
        rankingVersion: "hybrid-v0" as const,
        reasonCodes: ["taste_match"],
        score: 0.88,
        scoreComponents: {
          catalogPriority: 0.8,
          diversity: 1,
          freshness: 0.7,
          matchConfidence: 0.9,
          similarity: 0.88,
        },
      },
      tidalTrackId: "tidal-b",
      title: "Get Lucky",
    },
  },
];

const batches: RecommendationHistoryEntry[] = [{
  batchId: "batch-a",
  createdAt: "2026-09-29T00:00:00.000Z",
  rankingVersion: "hybrid-v0",
  status: "current",
  tracks,
}];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders batch and decision states", () => {
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  expect(screen.getByText("현재 추천")).toBeInTheDocument();
  expect(screen.getByText("HYBRID RANKING")).toBeInTheDocument();
  expect(screen.getByText("MMS로 보냄")).toBeInTheDocument();
  expect(screen.getByText("결정 없음")).toBeInTheDocument();
  expect(screen.getByText("One More Time")).toBeInTheDocument();
});

it("queues the tracks from their recommendation batch before playback", async () => {
  musicSession.setQueue.mockClear();
  musicSession.playTrack.mockClear();
  const user = userEvent.setup();
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "재생 Get Lucky" }));

  expect(musicSession.setQueue).toHaveBeenCalledWith(
    tracks.map(({ track }) => track),
    { id: "gms-history-batch-a", type: "gms" },
  );
  expect(musicSession.playTrack).toHaveBeenCalledWith(
    tracks[1].track,
    { id: "gms-history-batch-a", type: "gms" },
  );
});

it("keeps the track when the user cancels deletion", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "추천 이력에서 삭제 One More Time" }));

  expect(confirm).toHaveBeenCalledWith("이 곡을 추천 이력에서 삭제할까요? 삭제해도 다시 추천되지는 않습니다.");
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText("One More Time")).toBeInTheDocument();
});

it("removes a confirmed track from the visible history and refreshes server data", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "추천 이력에서 삭제 One More Time" }));

  await waitFor(() => expect(screen.queryByText("One More Time")).not.toBeInTheDocument());
  expect(fetch).toHaveBeenCalledWith("/api/recommendations/history", {
    body: JSON.stringify({ batchId: "batch-a", trackId: "track-a" }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  });
  expect(router.refresh).toHaveBeenCalledOnce();
});

it("keeps the track and announces an error when deletion fails", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "추천 이력에서 삭제 Get Lucky" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("“Get Lucky” 트랙을 추천 이력에서 삭제하지 못했습니다.");
  expect(screen.getByText("Get Lucky")).toBeInTheDocument();
  expect(router.refresh).not.toHaveBeenCalled();
});
