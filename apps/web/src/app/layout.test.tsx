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

  expect(screen.getAllByRole("link", { name: "홈" })[0]).toHaveAttribute("href", "/");
  expect(screen.getAllByRole("link", { name: "EMS" })[0]).toHaveAttribute("href", "/ems");
  expect(screen.getAllByRole("link", { name: "GMS" })[0]).toHaveAttribute("href", "/gms");
  expect(screen.getAllByRole("link", { name: "MMS" })[0]).toHaveAttribute("href", "/mms");
  expect(screen.getAllByRole("link", { name: "검색" })[0]).toHaveAttribute("href", "/search");
  expect(screen.getAllByRole("link", { name: "EMS" })[0]).toHaveAttribute("aria-current", "page");
});
