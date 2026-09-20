import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { MusicSessionProvider } from "@/providers/music-session-provider";

import HomePage from "./page";

function renderHomePage() {
  return render(
    <MusicSessionProvider>
      <HomePage />
    </MusicSessionProvider>,
  );
}

it("renders the Music Pie discovery heading", () => {
  renderHomePage();

  expect(
    screen.getByRole("heading", { name: /music pie/i }),
  ).toBeInTheDocument();
});

it("offers public discovery and a separate TIDAL connection action to a guest", () => {
  renderHomePage();

  expect(screen.getByRole("link", { name: "공개 탐색 시작" })).toHaveAttribute("href", "/ems");
  expect(screen.getByRole("button", { name: "TIDAL 연결" })).toBeInTheDocument();
});

it("shows public discovery rails to a guest", () => {
  renderHomePage();

  expect(screen.getByRole("heading", { name: "최신곡" })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "플랫폼별 플레이리스트" }),
  ).toBeInTheDocument();
});

it("opens a sign-in gate instead of saving for a guest", async () => {
  const user = userEvent.setup();

  renderHomePage();

  await user.click(
    screen.getAllByRole("button", { name: /내 취향으로 담기 midnight city/i })[0],
  );

  expect(
    screen.getByRole("dialog", { name: /tidal 연결/i }),
  ).toBeInTheDocument();
});
