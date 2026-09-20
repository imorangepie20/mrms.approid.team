import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { MusicSessionProvider } from "@/providers/music-session-provider";
import { PersistentPlayer } from "@/components/player/persistent-player";
import HomePage from "./page";

function renderPage() { return render(<MusicSessionProvider><HomePage /><PersistentPlayer /></MusicSessionProvider>); }

it("renders the dashboard discovery hero and catalog entry", () => {
  renderPage();
  expect(screen.getByRole("heading", { name: "당신의 다음 장면" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "카탈로그 둘러보기" })).toHaveAttribute("href", "/ems");
});

it("groups discovery into latest, personalized, and platform collections", () => {
  renderPage();

  expect(screen.getByRole("heading", { name: "새로 도착한 소리" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "당신을 위한 다음 곡" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "플랫폼에서 건너온 선곡" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "지금 흐르는 플레이리스트" })).toBeInTheDocument();
});

it("uses album artwork in discovery cards", () => {
  renderPage();

  expect(screen.getAllByAltText("Midnight City 앨범 아트").length).toBeGreaterThan(0);
});

it("plays a public discovery track without requiring sign-in", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getAllByRole("button", { name: "Midnight City 재생" })[0]);
  expect(screen.getByRole("button", { name: "Now playing Midnight City" })).toBeInTheDocument();
});
