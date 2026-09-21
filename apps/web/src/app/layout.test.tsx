import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { getSession, getUserLikes, usePathname } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserLikes: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname,
}));

vi.mock("@/lib/auth/auth0", () => ({
  auth0: { getSession },
}));

vi.mock("@/lib/db/user-likes", () => ({ getUserLikes }));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

import RootLayout from "./layout";

beforeEach(() => {
  usePathname.mockReturnValue("/ems");
  getSession.mockResolvedValue(null);
  getUserLikes.mockResolvedValue([]);
});

it("renders the five global navigation destinations and anonymous Auth0 actions", async () => {
  render(
    await RootLayout({ children: (
      <p>Page content</p>
    ) }),
  );

  expect(screen.getByRole("link", { name: "홈MAIN" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "External Music SpaceEMS" })).toHaveAttribute("href", "/ems");
  expect(screen.getByRole("link", { name: "Gateway Music SpaceGMS" })).toHaveAttribute("href", "/gms");
  expect(screen.getByRole("link", { name: "My Music SpaceMMS" })).toHaveAttribute("href", "/mms");
  expect(screen.getByRole("link", { name: "⌕ 검색" })).toHaveAttribute("href", "/search");
  expect(screen.getByRole("link", { name: "External Music SpaceEMS" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/api/auth/login");
  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/api/auth/signup");
});

it("loads the authenticated user's likes once for the global provider", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://test";
  getSession.mockResolvedValue({
    user: { email: "listener@example.com", name: "Listener", sub: "auth0|listener-a" },
  });
  getUserLikes.mockResolvedValue([{
    artworkUrl: "",
    createdAt: "2026-09-21T00:00:00.000Z",
    entityType: "artist",
    metadata: {},
    source: "tidal",
    sourceId: "artist-1",
    subtitle: "",
    title: "Björk",
  }]);

  render(await RootLayout({ children: <p>Page content</p> }));

  expect(getUserLikes).toHaveBeenCalledOnce();
  expect(getUserLikes).toHaveBeenCalledWith("auth0|listener-a");
  process.env.DATABASE_URL = previousDatabaseUrl;
});

it("keeps one music session provider around route content and the global player", async () => {
  render(await RootLayout({ children: <div>route content</div> }));

  const sessionRoot = screen.getByTestId("music-session-root");
  expect(sessionRoot).toContainElement(screen.getByText("route content"));
  expect(screen.getAllByLabelText("전역 음악 플레이어")).toHaveLength(1);
  expect(sessionRoot).toContainElement(screen.getByLabelText("전역 음악 플레이어"));
});
