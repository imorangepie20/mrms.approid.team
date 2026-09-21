import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { LikeItem } from "@/lib/likes/types";
import { LikesProvider } from "@/providers/likes-provider";

const session = vi.hoisted(() => ({
  acceptTrack: vi.fn(),
  musicState: { mmsTrackIds: [], rejectedTrackIds: [] },
  playTrack: vi.fn(),
  rejectTrack: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/gms",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { MusicDashboard } from "./music-dashboard";

function renderDashboard(node: React.ReactNode, initialLikes: LikeItem[] = []) {
  return render(
    <LikesProvider initialLikes={initialLikes} isAuthenticated>{node}</LikesProvider>,
  );
}

it("shows liked MMS content when TIDAL is disconnected", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "disconnected", isAuthenticated: true }}
      space="mms"
    />,
    [
      {
        artworkUrl: "",
        createdAt: "2026-09-21T00:00:00.000Z",
        entityType: "track",
        metadata: {
          album: "Discovery",
          durationSeconds: 320,
          playbackAvailable: true,
        },
        source: "tidal",
        sourceId: "776453",
        subtitle: "Daft Punk",
        title: "One More Time",
      },
      {
        artworkUrl: "",
        createdAt: "2026-09-21T00:00:00.000Z",
        entityType: "playlist",
        metadata: { trackCount: 12 },
        source: "tidal",
        sourceId: "playlist-a",
        subtitle: "12 tracks",
        title: "My favorites",
      },
    ],
  );

  expect(screen.getByText("One More Time")).toBeInTheDocument();
  expect(screen.getByText("My favorites")).toBeInTheDocument();
  expect(screen.getByTestId("liked-track-count")).toHaveTextContent("1");
  expect(screen.getByText("좋아요는 그대로 유지됩니다.")).toBeInTheDocument();
  expect(screen.queryByText("TIDAL 연결이 필요합니다.")).not.toBeInTheDocument();
});

it("keeps GMS recommendation decisions separate from persistent hearts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    item: {
      artworkUrl: "https://images.unsplash.com/track.jpg",
      createdAt: "2026-09-21T00:00:00.000Z",
      entityType: "track",
      metadata: { album: "Hurry Up, We're Dreaming", playbackAvailable: true },
      source: "catalog",
      sourceId: "t-1",
      subtitle: "M83",
      title: "Midnight City",
    },
    liked: true,
  })));
  const user = userEvent.setup();
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      space="gms"
    />,
  );

  expect(screen.getAllByRole("button", { name: "추천 수락" })).not.toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "좋아요 Midnight City" }));

  expect(session.acceptTrack).not.toHaveBeenCalled();
  expect(session.rejectTrack).not.toHaveBeenCalled();
  expect(session.playTrack).not.toHaveBeenCalled();
});
