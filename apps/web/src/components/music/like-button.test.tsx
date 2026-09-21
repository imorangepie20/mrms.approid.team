import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useRouter: () => ({ push: vi.fn() }),
}));

import { LikesProvider } from "@/providers/likes-provider";
import { LikeButton } from "./like-button";

it("exposes pressed state without relying on heart color", () => {
  render(
    <LikesProvider
      initialLikes={[{
        artworkUrl: "",
        createdAt: "2026-09-21T00:00:00.000Z",
        entityType: "artist",
        metadata: {},
        source: "tidal",
        sourceId: "artist-1",
        subtitle: "",
        title: "Björk",
      }]}
      isAuthenticated
    >
      <LikeButton item={{
        artworkUrl: "",
        entityType: "artist",
        metadata: {},
        source: "tidal",
        sourceId: "artist-1",
        subtitle: "",
        title: "Björk",
      }} />
    </LikesProvider>,
  );

  expect(screen.getByRole("button", { name: "좋아요 취소 Björk" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
