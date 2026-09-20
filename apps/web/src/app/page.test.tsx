import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { MusicSessionProvider } from "@/providers/music-session-provider";
import HomePage from "./page";

function renderPage() { return render(<MusicSessionProvider><HomePage /></MusicSessionProvider>); }

it("renders the dashboard discovery hero and catalog entry", () => {
  renderPage();
  expect(screen.getByRole("heading", { name: "당신의 다음 장면" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "카탈로그 둘러보기" })).toHaveAttribute("href", "/ems");
});

it("plays a public discovery track without requiring sign-in", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getAllByRole("button", { name: "▶" })[0]);
  expect(screen.getByText("Midnight City")).toBeInTheDocument();
});
