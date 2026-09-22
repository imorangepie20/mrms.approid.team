import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => ({
    acceptTrack: vi.fn(),
    currentTrack: null,
    isAuthenticated: true,
    playbackStatus: "idle",
    playTrack: vi.fn(),
    setQueue: vi.fn(),
  }),
}));
vi.mock("@/providers/likes-provider", () => ({
  useLikes: () => ({
    isAuthenticated: false,
    isLiked: () => false,
    isPending: () => false,
    toggle: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ems",
  useRouter: () => ({ push: vi.fn() }),
}));

import { EmsBrowser } from "./ems-browser";

const track = {
  id: "track-a",
  tidalTrackId: "tidal-a",
  title: "One More Time",
  artist: "Daft Punk",
  album: "Discovery",
  artworkClass: "from-violet-500 to-slate-900",
  artworkUrl: "",
  durationSeconds: 31,
};
const sections = [
  {
    slug: "new-releases",
    title: "신곡 퍼레이드",
    description: "지금 막 도착한 새로운 음악",
    tracks: [track],
  },
];

describe("EmsBrowser", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/ems/sections")) {
        return Promise.resolve(Response.json({ totalCount: 54, sections }));
      }
      return Promise.resolve(Response.json({ tracks: [track], nextCursor: null }));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows editorial sections and removes unsupported platform filters", async () => {
    render(<EmsBrowser />);

    expect(
      await screen.findByRole("heading", { name: "신곡 퍼레이드" }),
    ).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Spotify" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apple Music" })).not.toBeInTheDocument();
  });

  it("switches to debounced search and restores cached sections when cleared", async () => {
    const user = userEvent.setup();
    render(<EmsBrowser />);
    await screen.findByRole("heading", { name: "신곡 퍼레이드" });

    const search = screen.getByRole("searchbox", { name: "카탈로그 검색" });
    await user.type(search, "jazz");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("query=jazz"),
        expect.anything(),
      ),
    );
    await user.clear(search);

    expect(
      screen.getByRole("heading", { name: "신곡 퍼레이드" }),
    ).toBeInTheDocument();
  });

  it("shows recoverable section and preparation states", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const { unmount } = render(<EmsBrowser />);
    expect(
      await screen.findByText("편집 선곡을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    unmount();

    fetchMock.mockResolvedValueOnce(Response.json({ totalCount: 0, sections: [] }));
    render(<EmsBrowser />);
    expect(
      await screen.findByText("새로운 편집 선곡을 준비하고 있습니다."),
    ).toBeInTheDocument();
  });

  it("explains an empty search result", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/api/ems/sections")
          ? Response.json({ totalCount: 54, sections })
          : Response.json({ tracks: [], nextCursor: null }),
      ),
    );
    const user = userEvent.setup();
    render(<EmsBrowser />);

    await user.type(
      await screen.findByRole("searchbox", { name: "카탈로그 검색" }),
      "없는 음악",
    );

    expect(
      await screen.findByText("검색 결과가 없습니다. 다른 제목이나 아티스트를 입력해 보세요."),
    ).toBeInTheDocument();
  });

  it("keeps cached sections when an in-flight search is aborted", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/api/ems/sections")) {
        return Promise.resolve(Response.json({ totalCount: 54, sections }));
      }
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    const user = userEvent.setup();
    render(<EmsBrowser />);
    const search = await screen.findByRole("searchbox", { name: "카탈로그 검색" });

    await user.type(search, "jazz");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("query=jazz"),
        expect.anything(),
      ),
    );
    await user.clear(search);

    expect(
      screen.getByRole("heading", { name: "신곡 퍼레이드" }),
    ).toBeInTheDocument();
  });
});
