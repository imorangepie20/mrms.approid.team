import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LikesProvider } from "@/providers/likes-provider";

import { AddToPlaylistButton } from "./add-to-playlist-button";

const track = {
  album: "Homogenic",
  artist: "Björk",
  artworkClass: "from-violet-500 to-sky-500",
  artworkUrl: "https://resources.tidal.com/cover.jpg",
  durationSeconds: 300,
  id: "ems-row-7",
  tidalTrackId: "42",
  title: "Jóga",
};

const playlist = {
  containsTrack: false,
  createdAt: "2026-09-28T00:00:00.000Z",
  description: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "밤 산책",
  trackCount: 2,
  updatedAt: "2026-09-28T00:00:00.000Z",
};

function renderButton(isAuthenticated = true) {
  return render(
    <LikesProvider initialLikes={[]} isAuthenticated={isAuthenticated}>
      <AddToPlaylistButton track={track} />
    </LikesProvider>,
  );
}

describe("AddToPlaylistButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads playlists and adds the track to the selected playlist", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ playlists: [playlist] }))
      .mockResolvedValueOnce(Response.json({ item: { id: "item-1" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "플레이리스트에 추가 Jóga" }));
    expect(await screen.findByRole("dialog", { name: "Jóga 플레이리스트에 추가" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "밤 산책에 추가" }));

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/mms/playlists?trackKey=tidal%3A42",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api/mms/playlists/${playlist.id}/tracks`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("밤 산책에 추가했습니다.")).toBeInTheDocument();
  });

  it("marks a playlist that already contains the track", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      playlists: [{ ...playlist, containsTrack: true }],
    })));
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "플레이리스트에 추가 Jóga" }));

    expect(await screen.findByRole("button", { name: "밤 산책에 이미 추가됨" })).toBeDisabled();
  });

  it("creates a playlist inline and adds the track", async () => {
    const created = { ...playlist, id: "22222222-2222-4222-8222-222222222222", name: "새 목록", trackCount: 0 };
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ playlists: [] }))
      .mockResolvedValueOnce(Response.json({ playlist: created }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ item: { id: "item-2" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "플레이리스트에 추가 Jóga" }));
    await user.type(await screen.findByLabelText("새 플레이리스트 이름"), "새 목록");
    await user.click(screen.getByRole("button", { name: "만들고 추가" }));

    expect(fetch).toHaveBeenNthCalledWith(2, "/api/mms/playlists", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(3, `/api/mms/playlists/${created.id}/tracks`, expect.objectContaining({ method: "POST" }));
    expect(await screen.findByText("새 목록에 추가했습니다.")).toBeInTheDocument();
  });

  it("shows a sign-in action without loading private data", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    renderButton(false);

    await user.click(screen.getByRole("button", { name: "플레이리스트에 추가 Jóga" }));

    expect(screen.getByText("플레이리스트를 사용하려면 로그인이 필요합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "로그인하고 계속하기" })).toHaveAttribute("href", expect.stringContaining("/api/auth/login"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
