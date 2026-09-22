import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

import { PersistentPlayer } from "@/components/player/persistent-player";
import { LikesProvider } from "@/providers/likes-provider";
import { MusicSessionProvider } from "@/providers/music-session-provider";

import HomePage from "./page";

const track = {
  album: "Discovery",
  artist: "Daft Punk",
  artworkClass: "from-violet-700 to-slate-900",
  artworkUrl: "",
  id: "track-a",
  tidalTrackId: "tidal-a",
  title: "One More Time",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    totalCount: 54,
    sections: [
      {
        slug: "new-releases",
        title: "신곡 퍼레이드",
        description: "지금 막 도착한 새로운 음악",
        tracks: [track],
      },
      {
        slug: "seasonal-jazz",
        title: "시원한 가을 바람과 함께, 재즈",
        description: "여유로운 재즈 셀렉션",
        tracks: [],
      },
      {
        slug: "night-rnb",
        title: "도시의 밤을 채우는 R&B",
        description: "늦은 시간에 어울리는 부드러운 트랙",
        tracks: [],
      },
    ],
  })));
});

function renderPage() {
  return render(
    <MusicSessionProvider>
      <LikesProvider initialLikes={[]} isAuthenticated={false}>
        <HomePage />
        <PersistentPlayer />
      </LikesProvider>
    </MusicSessionProvider>,
  );
}

it("renders the dashboard discovery hero and catalog entry", () => {
  renderPage();
  expect(screen.getByRole("heading", { name: "당신의 다음 장면" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "카탈로그 둘러보기" })).toHaveAttribute("href", "/ems");
});

it("groups discovery into live editorial sections", async () => {
  renderPage();

  expect(
    await screen.findByRole("heading", { name: "신곡 퍼레이드" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "시원한 가을 바람과 함께, 재즈" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Midnight Frequencies")).not.toBeInTheDocument();
});

it("plays a public editorial track without requiring sign-in", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(
    await screen.findByRole("button", { name: "재생 One More Time" }),
  );
  expect(
    screen.getByRole("button", { name: "Now playing One More Time" }),
  ).toBeInTheDocument();
});
