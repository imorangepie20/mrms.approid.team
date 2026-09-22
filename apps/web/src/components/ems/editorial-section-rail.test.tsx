import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LikesProvider } from "@/providers/likes-provider";

const session = vi.hoisted(() => ({
  acceptTrack: vi.fn(),
  isAuthenticated: true,
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ems",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { EditorialSectionRail } from "./editorial-section-rail";

const tracks = [
  {
    album: "Discovery",
    artist: "Daft Punk",
    artworkClass: "from-violet-700 to-slate-900",
    artworkUrl: "",
    id: "track-a",
    tidalTrackId: "tidal-a",
    title: "One More Time",
  },
  {
    album: "Voodoo",
    artist: "D'Angelo",
    artworkClass: "from-fuchsia-700 to-slate-900",
    artworkUrl: "",
    id: "track-b",
    tidalTrackId: "tidal-b",
    title: "Send It On",
  },
];

describe("EditorialSectionRail", () => {
  it("renders approved copy, links to EMS, and queues the whole section before play", async () => {
    const user = userEvent.setup();
    render(
      <LikesProvider initialLikes={[]} isAuthenticated>
        <EditorialSectionRail
          moreHref="/ems"
          section={{
            slug: "new-releases",
            title: "신곡 퍼레이드",
            description: "지금 막 도착한 새로운 음악",
            tracks,
          }}
        />
      </LikesProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "신곡 퍼레이드" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "EMS에서 더 보기" })).toHaveAttribute(
      "href",
      "/ems",
    );

    await user.click(
      screen.getByRole("button", { name: `재생 ${tracks[0].title}` }),
    );

    expect(session.setQueue).toHaveBeenCalledWith(tracks, {
      id: "new-releases",
      type: "ems",
    });
    expect(session.playTrack).toHaveBeenCalledWith(tracks[0], {
      id: "new-releases",
      type: "ems",
    });
  });
});
