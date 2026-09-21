import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LikesProvider } from "@/providers/likes-provider";

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useRouter: () => ({ push: vi.fn() }),
}));

const session = vi.hoisted(() => ({
  pausePlayback: vi.fn().mockResolvedValue(undefined),
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { TidalSearch } from "./tidal-search";

function renderSearch() {
  return render(
    <LikesProvider initialLikes={[]} isAuthenticated>
      <TidalSearch />
    </LikesProvider>,
  );
}

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
    renderSearch();
    const searchbox = screen.getByRole("searchbox");

    fireEvent.change(searchbox, { target: { value: "ab" } });
    await waitFor(() => expect(pending.has("ab")).toBe(true));
    fireEvent.change(searchbox, { target: { value: "abc" } });
    await waitFor(() => expect(pending.has("abc")).toBe(true));
    await act(async () => pending.get("abc")?.(Response.json({
      albums: [], artists: [], next: null, playlists: [], topHits: [{ ...track, kind: "track" }], tracks: [track],
    })));
    await act(async () => pending.get("ab")?.(Response.json({
      albums: [], artists: [], next: null, playlists: [], topHits: [],
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
            artists: [{
              artworkUrl: "https://resources.tidal.com/artist.jpg",
              id: "artist-1",
              name: "Björk",
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
                artworkUrl: "https://resources.tidal.com/artist.jpg",
                id: "artist-1",
                kind: "artist",
                name: "Björk",
              },
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
    renderSearch();

    await user.type(screen.getByRole("searchbox"), "bj");
    expect(await screen.findByRole("tab", { name: "통합 결과" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "아티스트" })).toBeInTheDocument();
    expect(await screen.findByText("앨범 · Björk")).toBeInTheDocument();
    expect(screen.getByText("플레이리스트 · TIDAL · 100곡")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Human Behaviour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Debut" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Lazy Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Björk" })).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: "좋아요 Debut" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "플레이리스트" }));
    expect(screen.getByRole("img", { name: "Lazy Days 플레이리스트 커버" })).toBeInTheDocument();
    expect(screen.getByText("100곡")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Lazy Days" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "아티스트" }));
    expect(screen.getByText("Björk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "좋아요 Björk" })).toBeInTheDocument();
  });

  it.each([
    ["album", "앨범 Debut 열기", "Debut", "Björk"],
    ["playlist", "플레이리스트 Lazy Days 열기", "Lazy Days", "TIDAL"],
  ] as const)("opens %s details and plays its track queue", async (kind, label, title, secondary) => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/suggestions")) return json({ suggestions: [] });
      if (url.pathname.endsWith("/catalog")) return json({ tracks: [track] });
      return json({
        albums: [{
          artist: "Björk",
          artworkUrl: "https://resources.tidal.com/album.jpg",
          id: "album-1",
          title: "Debut",
        }],
        artists: [],
        next: null,
        playlists: [{
          artworkUrl: "https://resources.tidal.com/playlist.jpg",
          curator: "TIDAL",
          id: "playlist-1",
          title: "Lazy Days",
          trackCount: 100,
        }],
        topHits: [],
        tracks: [],
      });
    }));
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByRole("searchbox"), "bj");
    await user.click(screen.getByRole("tab", { name: kind === "album" ? "앨범" : "플레이리스트" }));
    await user.click(await screen.findByRole("button", { name: label }));

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`^${secondary} ·`))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `좋아요 ${title}` })).toBeInTheDocument();
    expect(screen.getByText("Human Behaviour")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "전체 재생" }));

    expect(session.setQueue).toHaveBeenCalledWith(
      [track],
      expect.objectContaining({ id: `${kind}:${kind}-1`, type: "search" }),
    );
    expect(session.playTrack).toHaveBeenCalledWith(
      track,
      expect.objectContaining({ id: `${kind}:${kind}-1`, type: "search" }),
    );

    expect(screen.queryByRole("button", { name: "TIDAL 전체 재생" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "검색 결과로 돌아가기" }));
    expect(screen.getByRole("searchbox")).toHaveValue("bj");
    expect(screen.getByRole("tab", { name: kind === "album" ? "앨범" : "플레이리스트" })).toHaveAttribute("aria-selected", "true");
  });
});
