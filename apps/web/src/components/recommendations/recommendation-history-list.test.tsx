import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { RecommendationHistoryEntry } from "@/lib/db/gms-recommendation-batches";
import { LikesProvider } from "@/providers/likes-provider";

const musicSession = vi.hoisted(() => ({
  currentTrack: null,
  playbackStatus: "idle",
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => musicSession,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/gms/history",
  useRouter: () => ({ push: vi.fn() }),
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
