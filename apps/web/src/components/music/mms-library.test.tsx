import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LikeItem } from "@/lib/likes/types";
import type { MmsPlaylistSummary } from "@/lib/mms/playlists";
import { LikesProvider } from "@/providers/likes-provider";

const session = vi.hoisted(() => ({
  currentTrack: null,
  playbackStatus: "idle",
  playQueue: vi.fn(),
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/mms",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { MmsLibrary, type MmsImportedPlaylist } from "./mms-library";

const createdAt = "2026-09-21T00:00:00.000Z";
const likedTrack: LikeItem = {
  artworkUrl: "",
  createdAt,
  entityType: "track",
  metadata: { album: "Homogenic", durationSeconds: 300, playbackAvailable: true },
  source: "tidal",
  sourceId: "track-1",
  subtitle: "Björk",
  title: "Jóga",
};
const likedPlaylist: LikeItem = {
  artworkUrl: "",
  createdAt,
  entityType: "playlist",
  metadata: { trackCount: 25 },
  source: "tidal",
  sourceId: "playlist-1",
  subtitle: "TIDAL",
  title: "Iceland Essentials",
};
const likedAlbum: LikeItem = {
  artworkUrl: "",
  createdAt,
  entityType: "album",
  metadata: { artist: "Björk" },
  source: "tidal",
  sourceId: "album-1",
  subtitle: "Björk",
  title: "Homogenic",
};
const likedArtist: LikeItem = {
  artworkUrl: "",
  createdAt,
  entityType: "artist",
  metadata: {},
  source: "tidal",
  sourceId: "artist-1",
  subtitle: "",
  title: "Björk",
};

const importedPlaylist: MmsImportedPlaylist = {
  artworkUrl: "",
  id: "saved-playlist-1",
  name: "Imported Favorites",
  tidalPlaylistId: "tidal-playlist-1",
  tracks: [{
    album: "Homogenic",
    artist: "Björk",
    artworkClass: "from-violet-500 to-sky-500",
    artworkUrl: "",
    durationSeconds: 300,
    id: "saved-track-1",
    tidalTrackId: "tidal-track-1",
    title: "Jóga",
  }],
};

const internalPlaylist: MmsPlaylistSummary = {
  createdAt: "2026-09-28T00:00:00.000Z",
  description: "밤에 듣는 곡",
  id: "11111111-1111-4111-8111-111111111111",
  name: "밤 산책",
  trackCount: 2,
  updatedAt: "2026-09-28T01:00:00.000Z",
};

function renderMms(
  initialLikes: LikeItem[],
  importedPlaylists: MmsImportedPlaylist[] = [],
  mmsPlaylists: MmsPlaylistSummary[] = [],
) {
  return render(
    <LikesProvider initialLikes={initialLikes} isAuthenticated>
      <MmsLibrary
        access={{ connectionStatus: "connected", isAuthenticated: true }}
        importedPlaylists={importedPlaylists}
        mmsPlaylists={mmsPlaylists}
      />
    </LikesProvider>,
  );
}

describe("MmsLibrary likes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the imported and four liked sections in the approved order", () => {
    renderMms([likedTrack, likedPlaylist, likedAlbum, likedArtist]);

    expect(screen.getByRole("heading", { level: 1, name: "My Music Space" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "내 좋아요" })).not.toBeInTheDocument();
    expect(screen.queryByText("저장한 트랙")).not.toBeInTheDocument();
    const summaries = screen.getByTestId("like-summaries");
    expect(within(summaries).getByText("좋아요한 트랙").nextSibling).toHaveTextContent("1");
    expect(within(summaries).getByText("좋아요한 플레이리스트").nextSibling).toHaveTextContent("1");
    expect(within(summaries).getByText("좋아요한 앨범").nextSibling).toHaveTextContent("1");
    expect(within(summaries).getByText("좋아요한 아티스트").nextSibling).toHaveTextContent("1");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "내 플레이리스트",
      "가져온 플레이리스트",
      "좋아요한 트랙",
      "좋아요한 플레이리스트",
      "좋아요한 앨범",
      "좋아요한 아티스트",
    ]);
  });

  it("removes the final liked track and updates its empty state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ liked: false })));
    const user = userEvent.setup();
    renderMms([likedTrack]);

    await user.click(screen.getByRole("button", { name: "좋아요 취소 Jóga" }));

    expect(await screen.findByText("좋아요한 트랙이 없습니다.")).toBeInTheDocument();
    expect(screen.getByTestId("liked-track-count")).toHaveTextContent("0");
  });

  it("renders imported playlists before the liked sections", () => {
    renderMms([likedTrack], [importedPlaylist]);

    expect(screen.getByRole("button", { name: "가져온 플레이리스트 Imported Favorites 열기" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "내 플레이리스트",
      "가져온 플레이리스트",
      "좋아요한 트랙",
      "좋아요한 플레이리스트",
      "좋아요한 앨범",
      "좋아요한 아티스트",
    ]);
  });

  it("plays the stored tracks from an imported playlist detail", async () => {
    const user = userEvent.setup();
    renderMms([], [importedPlaylist]);

    await user.click(screen.getByRole("button", { name: "가져온 플레이리스트 Imported Favorites 열기" }));
    expect(await screen.findByRole("heading", { name: "Imported Favorites" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MMS 목록으로 돌아가기" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "전체 재생" }));

    expect(session.playQueue).toHaveBeenCalledWith(importedPlaylist.tracks, {
      id: "imported-playlist:saved-playlist-1",
      type: "mms",
    });
    await user.click(screen.getByRole("button", { name: "셔플" }));
    expect(session.playQueue).toHaveBeenCalledWith(importedPlaylist.tracks, {
      id: "imported-playlist:saved-playlist-1",
      type: "mms",
    }, { shuffle: true });
  });

  it.each([
    [likedPlaylist, "플레이리스트 Iceland Essentials 열기", "liked-playlist:playlist-1"],
    [likedAlbum, "앨범 Homogenic 열기", "liked-album:album-1"],
  ] as const)("opens liked catalog detail and plays its queue", async (likedItem, label, sourceId) => {
    const detailTrack = {
      album: "Homogenic",
      artist: "Björk",
      artworkClass: "from-violet-500 to-sky-500",
      artworkUrl: "",
      durationSeconds: 300,
      id: "track-1",
      tidalTrackId: "track-1",
      title: "Jóga",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ tracks: [detailTrack] })));
    const user = userEvent.setup();
    renderMms([likedItem]);

    await user.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByRole("heading", { name: likedItem.title })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "전체 재생" }));

    expect(session.playQueue).toHaveBeenCalledWith([detailTrack], { id: sourceId, type: "mms" });
  });

  it("creates an internal playlist and shows it before imported playlists", async () => {
    const created = { ...internalPlaylist, id: "22222222-2222-4222-8222-222222222222", name: "새 목록", trackCount: 0 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ playlist: created }, { status: 201 })));
    const user = userEvent.setup();
    renderMms([], [importedPlaylist]);

    await user.click(screen.getByRole("button", { name: "새 플레이리스트" }));
    await user.type(screen.getByLabelText("플레이리스트 이름"), "새 목록");
    await user.click(screen.getByRole("button", { name: "플레이리스트 만들기" }));

    expect(await screen.findByRole("button", { name: "내 플레이리스트 새 목록 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가져온 플레이리스트 Imported Favorites 열기" })).toBeInTheDocument();
  });

  it("opens an internal playlist and reorders then removes tracks", async () => {
    const detailTracks = [
      {
        createdAt: "2026-09-28T00:00:00.000Z",
        id: "22222222-2222-4222-8222-222222222222",
        position: 0,
        source: "tidal" as const,
        sourceId: "42",
        track: { ...importedPlaylist.tracks[0], id: "mms-playlist-track:item-1", title: "Jóga" },
        trackKey: "tidal:42",
      },
      {
        createdAt: "2026-09-28T00:01:00.000Z",
        id: "33333333-3333-4333-8333-333333333333",
        position: 1,
        source: "tidal" as const,
        sourceId: "43",
        track: { ...importedPlaylist.tracks[0], id: "mms-playlist-track:item-2", title: "Bachelorette" },
        trackKey: "tidal:43",
      },
    ];
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ playlist: { ...internalPlaylist, tracks: detailTracks } }))
      .mockResolvedValueOnce(Response.json({ reordered: true }))
      .mockResolvedValueOnce(Response.json({ deleted: true }));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    renderMms([], [], [internalPlaylist]);

    await user.click(screen.getByRole("button", { name: "내 플레이리스트 밤 산책 열기" }));
    expect(await screen.findByRole("heading", { name: "밤 산책" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bachelorette 위로 이동" }));
    await user.click(screen.getByRole("button", { name: "플레이리스트에서 Jóga 제거" }));

    expect(fetch).toHaveBeenNthCalledWith(2, `/api/mms/playlists/${internalPlaylist.id}/tracks/reorder`, expect.objectContaining({ method: "PATCH" }));
    expect(fetch).toHaveBeenNthCalledWith(3, `/api/mms/playlists/${internalPlaylist.id}/tracks/${detailTracks[0].id}`, expect.objectContaining({ method: "DELETE" }));
    expect(screen.queryByText("Jóga")).not.toBeInTheDocument();
  });

  it("edits and deletes an internal playlist with confirmation", async () => {
    const detail = { ...internalPlaylist, tracks: [] };
    const renamed = { ...internalPlaylist, name: "새 이름" };
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ playlist: detail }))
      .mockResolvedValueOnce(Response.json({ playlist: renamed }))
      .mockResolvedValueOnce(Response.json({ deleted: true }));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    renderMms([], [], [internalPlaylist]);

    await user.click(screen.getByRole("button", { name: "내 플레이리스트 밤 산책 열기" }));
    await user.click(await screen.findByRole("button", { name: "플레이리스트 편집" }));
    const name = screen.getByLabelText("플레이리스트 이름");
    await user.clear(name);
    await user.type(name, "새 이름");
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    expect(await screen.findByRole("heading", { name: "새 이름" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "플레이리스트 삭제" }));
    expect(screen.getByRole("alertdialog", { name: "새 이름 삭제" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "플레이리스트 영구 삭제" }));

    expect(await screen.findByText("내 플레이리스트가 없습니다.")).toBeInTheDocument();
  });
});
