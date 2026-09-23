import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LikesProvider } from "@/providers/likes-provider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/gms",
  useRouter: () => ({ push: vi.fn() }),
}));

const playTrack = vi.fn();
vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => ({
    acceptTrack: vi.fn(),
    isAuthenticated: true,
    playTrack,
  }),
}));

import { TrackCard } from "./track-card";

const track = {
  album: "Debut",
  artist: "Björk",
  artworkClass: "from-violet-500 to-sky-500",
  artworkUrl: "https://resources.tidal.com/cover.jpg",
  id: "track-7",
  title: "Human Behaviour",
};

describe("TrackCard", () => {
  it("uses the requested play handler and falls back after an image error", async () => {
    const onPlay = vi.fn();
    const user = userEvent.setup();
    render(
      <LikesProvider initialLikes={[]} isAuthenticated>
        <TrackCard track={track} onPlay={onPlay} showSave={false} />
      </LikesProvider>,
    );

    const image = screen.getByRole("img", { name: "Human Behaviour 앨범 아트" });
    fireEvent.error(image);
    expect(screen.queryByRole("img", { name: "Human Behaviour 앨범 아트" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "재생 Human Behaviour" }));
    const playButton = screen.getByRole("button", { name: "재생 Human Behaviour" });
    expect(playButton).toHaveClass("cover-play-button");
    expect(playButton.querySelector("svg.play-icon")).toBeInTheDocument();
    expect(playButton.querySelector("svg.play-icon")).not.toHaveClass("ml-0.5");
    expect(onPlay).toHaveBeenCalledWith(track);
    expect(playTrack).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /내 취향으로 담기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Human Behaviour" })).toBeInTheDocument();
  });
});
