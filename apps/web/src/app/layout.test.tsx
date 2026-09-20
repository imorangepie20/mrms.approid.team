import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname,
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "geist-sans" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
}));

import RootLayout from "./layout";

beforeEach(() => {
  usePathname.mockReturnValue("/ems");
});

it("renders the five global navigation destinations and marks the current page", () => {
  render(
    <RootLayout>
      <p>Page content</p>
    </RootLayout>,
  );

  expect(screen.getByRole("link", { name: "홈MAIN" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "External Music SpaceEMS" })).toHaveAttribute("href", "/ems");
  expect(screen.getByRole("link", { name: "Gateway Music SpaceGMS" })).toHaveAttribute("href", "/gms");
  expect(screen.getByRole("link", { name: "My Music SpaceMMS" })).toHaveAttribute("href", "/mms");
  expect(screen.getByRole("link", { name: "⌕ 검색" })).toHaveAttribute("href", "/search");
  expect(screen.getByRole("link", { name: "External Music SpaceEMS" })).toHaveAttribute("aria-current", "page");
});
