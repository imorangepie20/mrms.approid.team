import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => ({ currentTrack: null, playbackStatus: "idle", playTrack: vi.fn(), setQueue: vi.fn() }),
}));
vi.mock("@/providers/likes-provider", () => ({ useLikes: () => ({ isAuthenticated: false, isLiked: () => false, isPending: () => false, toggle: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/ems", useRouter: () => ({ push: vi.fn() }) }));

import { EmsBrowser } from "./ems-browser";

describe("EmsBrowser", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tracks: [{ id: "track-a", tidalTrackId: "tidal-a", title: "One More Time", artist: "Daft Punk", album: "Discovery", artworkClass: "from-violet-500", artworkUrl: "", durationSeconds: 31 }], nextCursor: null }), { status: 200 })));
  });

  it("loads tracks from EMS API instead of fixture catalog", async () => {
    render(<EmsBrowser />);
    await waitFor(() => expect(screen.getByText("One More Time")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/ems/catalog"), expect.anything());
    expect(screen.queryByText("Midnight City")).not.toBeInTheDocument();
  });
});
