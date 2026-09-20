import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Track } from "@/lib/music/types";

const session = vi.hoisted(() => ({
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { TrackList } from "./track-list";

const tracks: Track[] = [
  {
    album: "Discovery",
    artist: "Daft Punk",
    artworkClass: "from-violet-500 to-sky-500",
    artworkUrl: "https://resources.tidal.com/one-more-time.jpg",
    id: "track-1",
    title: "One More Time",
  },
  {
    album: "Random Access Memories",
    artist: "Daft Punk",
    artworkClass: "from-fuchsia-500 to-violet-500",
    artworkUrl: "https://resources.tidal.com/get-lucky.jpg",
    id: "track-2",
    title: "Get Lucky",
  },
];

describe("TrackList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues the full list and plays the selected track", async () => {
    const user = userEvent.setup();
    render(
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
    render(
      <TrackList
        emptyMessage="아직 저장한 트랙이 없습니다."
        source={{ id: "mms", type: "mms" }}
        tracks={[]}
      />,
    );

    expect(screen.getByText("아직 저장한 트랙이 없습니다.")).toBeInTheDocument();
  });

  it("reveals a play overlay on artwork hover or keyboard focus", () => {
    render(
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
});
