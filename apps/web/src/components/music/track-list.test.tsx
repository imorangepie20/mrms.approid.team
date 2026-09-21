import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybackStatus, Track } from "@/lib/music/types";
import { LikesProvider } from "@/providers/likes-provider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ems",
  useRouter: () => ({ push: vi.fn() }),
}));

const session = vi.hoisted(() => ({
  currentTrack: null as Track | null,
  playTrack: vi.fn(),
  playbackStatus: "idle" as PlaybackStatus,
  setQueue: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { TrackList } from "./track-list";

function renderWithLikes(node: React.ReactNode) {
  return render(
    <LikesProvider initialLikes={[]} isAuthenticated>{node}</LikesProvider>,
  );
}

const tracks: Track[] = [
  {
    album: "Discovery",
    artist: "Daft Punk",
    artworkClass: "from-violet-500 to-sky-500",
    artworkUrl: "https://resources.tidal.com/one-more-time.jpg",
    id: "track-1",
    tidalTrackId: "1",
    title: "One More Time",
  },
  {
    album: "Random Access Memories",
    artist: "Daft Punk",
    artworkClass: "from-fuchsia-500 to-violet-500",
    artworkUrl: "https://resources.tidal.com/get-lucky.jpg",
    id: "track-2",
    tidalTrackId: "2",
    title: "Get Lucky",
  },
];

describe("TrackList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.currentTrack = null;
    session.playbackStatus = "idle";
  });

  it("queues the full list and plays the selected track", async () => {
    const user = userEvent.setup();
    renderWithLikes(
      <TrackList
        source={{ id: "mms", type: "mms" }}
        tracks={tracks}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "TITLE" })).toBeInTheDocument();
    expect(screen.getByText("Random Access Memories")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "재생 Get Lucky" }));

    expect(session.setQueue).toHaveBeenCalledWith(tracks, { id: "mms", type: "mms" });
    expect(session.playTrack).toHaveBeenCalledWith(tracks[1], { id: "mms", type: "mms" });
  });

  it("shows the supplied empty state", () => {
    renderWithLikes(
      <TrackList
        emptyMessage="아직 저장한 트랙이 없습니다."
        source={{ id: "mms", type: "mms" }}
        tracks={[]}
      />,
    );

    expect(screen.getByText("아직 저장한 트랙이 없습니다.")).toBeInTheDocument();
  });

  it("reveals a play overlay on artwork hover or keyboard focus", () => {
    renderWithLikes(
      <TrackList
        source={{ id: "mms", type: "mms" }}
        tracks={tracks}
      />,
    );

    const playButton = screen.getByRole("button", { name: "재생 One More Time" });
    const overlay = within(playButton).getByTestId("track-play-overlay");

    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveClass(
      "opacity-0",
      "group-hover:opacity-100",
      "group-focus-within:opacity-100",
    );
  });

  it.each([
    ["playing", "현재 재생 중"],
    ["paused", "현재 트랙, 일시 정지"],
  ] as const)("marks the current track while playback is %s", (playbackStatus, statusLabel) => {
    session.currentTrack = { ...tracks[1], id: "saved-library-row" };
    session.playbackStatus = playbackStatus;

    renderWithLikes(
      <TrackList
        source={{ id: "mms", type: "mms" }}
        tracks={tracks}
      />,
    );

    const currentButton = screen.getByRole("button", { name: "재생 Get Lucky" });
    const currentRow = currentButton.closest("tr");
    const otherRow = screen.getByRole("button", { name: "재생 One More Time" }).closest("tr");

    expect(currentRow).toHaveAttribute("aria-current", "true");
    expect(within(currentRow as HTMLElement).getByLabelText(statusLabel)).toBeInTheDocument();
    expect(otherRow).not.toHaveAttribute("aria-current");
  });

  it("disables a track without STREAM availability", async () => {
    const user = userEvent.setup();
    const unavailableTrack: Track = {
      ...tracks[1],
      id: "unavailable-track",
      playbackAvailable: false,
      title: "Unavailable Track",
    };

    renderWithLikes(
      <TrackList
        source={{ id: "search", type: "search" }}
        tracks={[tracks[0], unavailableTrack]}
      />,
    );

    const button = screen.getByRole("button", { name: "재생 불가 Unavailable Track" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: "좋아요 Unavailable Track" })).toBeEnabled();

    await user.click(button);
    expect(session.setQueue).not.toHaveBeenCalled();
    expect(session.playTrack).not.toHaveBeenCalled();
  });

  it("likes a track without starting playback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      item: {
        artworkUrl: tracks[0].artworkUrl,
        createdAt: "2026-09-21T00:00:00.000Z",
        entityType: "track",
        metadata: { album: tracks[0].album, playbackAvailable: true },
        source: "tidal",
        sourceId: "1",
        subtitle: tracks[0].artist,
        title: tracks[0].title,
      },
      liked: true,
    })));
    const user = userEvent.setup();
    renderWithLikes(
      <TrackList source={{ id: "ems", type: "ems" }} tracks={tracks} />,
    );

    await user.click(screen.getByRole("button", { name: "좋아요 One More Time" }));

    expect(session.setQueue).not.toHaveBeenCalled();
    expect(session.playTrack).not.toHaveBeenCalled();
  });
});
