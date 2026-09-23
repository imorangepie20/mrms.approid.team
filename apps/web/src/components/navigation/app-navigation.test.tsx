import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ usePathname: vi.fn(() => "/search") }));
vi.mock("next/navigation", () => ({ usePathname: mocks.usePathname }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a data-next-link="true" href={href} {...props}>{children}</a>
  ),
}));

import { AppNavigation } from "./app-navigation";

describe("AppNavigation", () => {
  it("uses client navigation links for every internal application destination", () => {
    render(<AppNavigation />);

    const internalLinks = screen.getAllByRole("link").filter((link) =>
      ["/", "/search", "/mms", "/gms", "/ems"].includes(link.getAttribute("href") ?? ""),
    );
    expect(internalLinks.length).toBeGreaterThan(0);
    expect(internalLinks.every((link) => link.dataset.nextLink === "true")).toBe(true);
  });

  it("marks the search destination as active and exposes a real icon", () => {
    render(<AppNavigation />);

    const searchLink = screen.getByRole("link", { name: "검색" });
    expect(searchLink).toHaveAttribute("href", "/search");
    expect(searchLink).toHaveAttribute("aria-current", "page");
    expect(searchLink.querySelector("svg")).toBeInTheDocument();
    expect(searchLink).not.toHaveTextContent("⌕");
  });
});
