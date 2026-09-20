import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { TidalSearch } from "./tidal-search";

const track = {
  album: "Debut",
  artist: "Björk",
  artworkClass: "from-violet-500 to-sky-500",
  artworkUrl: "https://resources.tidal.com/cover.jpg",
  durationSeconds: 242,
  id: "track-7",
  tidalTrackId: "track-7",
  title: "Human Behaviour",
};

function json(value: unknown) {
  return Promise.resolve(Response.json(value));
}

describe("TidalSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only the latest search response", async () => {
    const pending = new Map<string, (response: Response) => void>();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/suggestions")) return json({ suggestions: [] });
      return new Promise<Response>((resolve) => pending.set(url.searchParams.get("q") ?? "", resolve));
    }));
    render(<TidalSearch />);
    const searchbox = screen.getByRole("searchbox");

    fireEvent.change(searchbox, { target: { value: "ab" } });
    await waitFor(() => expect(pending.has("ab")).toBe(true));
    fireEvent.change(searchbox, { target: { value: "abc" } });
    await waitFor(() => expect(pending.has("abc")).toBe(true));
    await act(async () => pending.get("abc")?.(Response.json({
      albums: [], artists: [], next: null, tracks: [track],
    })));
    await act(async () => pending.get("ab")?.(Response.json({
      albums: [], artists: [], next: null,
      tracks: [{ ...track, id: "old", tidalTrackId: "old", title: "Old result" }],
    })));

    expect(await screen.findByText("Human Behaviour")).toBeInTheDocument();
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
  });

  it("queues the current result set and plays the selected track", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      return url.pathname.endsWith("/suggestions")
        ? json({ suggestions: ["Björk"] })
        : json({ albums: [], artists: [], next: null, tracks: [track] });
    }));
    const user = userEvent.setup();
    render(<TidalSearch />);

    await user.type(screen.getByRole("searchbox"), "bj");
    await user.click(await screen.findByRole("button", { name: "재생 Human Behaviour" }));

    expect(session.setQueue).toHaveBeenCalledWith(
      [track],
      expect.objectContaining({ type: "search" }),
    );
    expect(session.playTrack).toHaveBeenCalledWith(
      track,
      expect.objectContaining({ type: "search" }),
    );
  });
});
