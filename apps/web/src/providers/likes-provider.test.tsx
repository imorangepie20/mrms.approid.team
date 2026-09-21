import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: vi.fn(() => "/ems"),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

import { LikeButton } from "@/components/music/like-button";
import type { LikeItem } from "@/lib/likes/types";
import { LikesProvider } from "./likes-provider";

const item = {
  artworkUrl: "",
  entityType: "track" as const,
  metadata: { album: "Homogenic" },
  source: "tidal" as const,
  sourceId: "42",
  subtitle: "Björk",
  title: "Jóga",
};
const savedItem: LikeItem = {
  ...item,
  createdAt: "2026-09-21T00:00:00.000Z",
};

function renderButton({ authenticated = true, initialLikes = [] as LikeItem[] } = {}) {
  return render(
    <LikesProvider initialLikes={initialLikes} isAuthenticated={authenticated}>
      <LikeButton item={item} />
    </LikesProvider>,
  );
}

describe("LikesProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically fills the heart and blocks duplicate clicks while pending", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "좋아요 Jóga" }));

    const pending = screen.getByRole("button", { name: "좋아요 취소 Jóga" });
    expect(pending).toHaveAttribute("aria-pressed", "true");
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolveRequest(Response.json({ item: savedItem, liked: true }));
    await waitFor(() => expect(pending).toBeEnabled());
  });

  it("restores the previous state and exposes an alert after a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "좋아요 Jóga" }));

    expect(await screen.findByRole("button", { name: "좋아요 Jóga" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("좋아요를 저장하지 못했습니다");
  });

  it("deletes an existing like", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ liked: false }));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderButton({ initialLikes: [savedItem] });

    await user.click(screen.getByRole("button", { name: "좋아요 취소 Jóga" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "좋아요 Jóga" })).toBeEnabled());
    expect(fetcher).toHaveBeenCalledWith(
      "/api/likes/track/tidal/42",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends an anonymous user to login without saving", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    renderButton({ authenticated: false });

    await user.click(screen.getByRole("button", { name: "좋아요 Jóga" }));

    expect(navigation.push).toHaveBeenCalledWith("/api/auth/login?returnTo=%2Fems");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
