import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserConnection: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  auth0: { getSession: mocks.getSession },
}));
vi.mock("@/lib/db/user-connections", () => ({
  getUserConnection: mocks.getUserConnection,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: vi.fn() }),
}));

import TidalConnectionPage from "./page";

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ user: { sub: "auth0|listener-a" } });
});

it("requires the single device approval when only the legacy connection exists", async () => {
  mocks.getUserConnection.mockResolvedValue({
    scope: "playlists.read",
    status: "connected",
  });

  render(await TidalConnectionPage({
    searchParams: Promise.resolve({ returnTo: "/mms" }),
  }));

  expect(screen.getByRole("status")).toHaveTextContent("TIDAL 연결 마무리 필요");
  expect(screen.getByRole("button", { name: "TIDAL 연결하기" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "음악 화면으로 계속" })).not.toBeInTheDocument();
});

it("continues without another approval when playback scope is already stored", async () => {
  mocks.getUserConnection.mockResolvedValue({
    scope: "r_usr w_usr w_sub",
    status: "connected",
  });

  render(await TidalConnectionPage({
    searchParams: Promise.resolve({ returnTo: "/mms" }),
  }));

  expect(screen.getByRole("status")).toHaveTextContent("TIDAL 연결됨");
  expect(screen.getByRole("link", { name: "음악 화면으로 계속" })).toHaveAttribute("href", "/mms");
  expect(screen.getByRole("link", { name: "플레이리스트 가져오기" })).toHaveAttribute(
    "href",
    "/onboarding?tidal=connected",
  );
  expect(screen.queryByRole("button", { name: "TIDAL 연결하기" })).not.toBeInTheDocument();
});
