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
      albums: [], next: null, playlists: [], topHits: [{ ...track, kind: "track" }], tracks: [track],
    })));
    await act(async () => pending.get("ab")?.(Response.json({
      albums: [], next: null, playlists: [], topHits: [],
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
        : json({
            albums: [{
              artist: "Björk",
              artworkUrl: "https://resources.tidal.com/album.jpg",
              id: "album-1",
              title: "Debut",
            }],
            next: null,
            playlists: [{
              artworkUrl: "https://resources.tidal.com/playlist.jpg",
              curator: "TIDAL",
              id: "playlist-1",
              title: "Lazy Days",
              trackCount: 100,
            }],
            topHits: [
              { ...track, kind: "track" },
              {
                artist: "Björk",
                artworkUrl: "https://resources.tidal.com/album.jpg",
                id: "album-1",
                kind: "album",
                title: "Debut",
              },
              {
                artworkUrl: "https://resources.tidal.com/playlist.jpg",
                curator: "TIDAL",
                id: "playlist-1",
                kind: "playlist",
                title: "Lazy Days",
                trackCount: 100,
              },
            ],
            tracks: [track],
          });
    }));
    const user = userEvent.setup();
    render(<TidalSearch />);

    await user.type(screen.getByRole("searchbox"), "bj");
    expect(await screen.findByRole("tab", { name: "통합 결과" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "아티스트" })).not.toBeInTheDocument();
    expect(await screen.findByText("앨범 · Björk")).toBeInTheDocument();
    expect(screen.getByText("플레이리스트 · TIDAL · 100곡")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "트랙" }));
    const playButton = screen.getByRole("button", { name: "재생 Human Behaviour" });
    expect(screen.getByRole("columnheader", { name: "TITLE" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ARTIST" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ALBUM" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "TIME" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(playButton);

    expect(session.setQueue).toHaveBeenCalledWith(
      [track],
      expect.objectContaining({ type: "search" }),
    );
    expect(session.playTrack).toHaveBeenCalledWith(
      track,
      expect.objectContaining({ type: "search" }),
    );

    await user.click(screen.getByRole("tab", { name: "앨범" }));
    expect(screen.getByRole("img", { name: "Debut 앨범 아트" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "플레이리스트" }));
    expect(screen.getByRole("img", { name: "Lazy Days 플레이리스트 커버" })).toBeInTheDocument();
    expect(screen.getByText("100곡")).toBeInTheDocument();
  });
});
