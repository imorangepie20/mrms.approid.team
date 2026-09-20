import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => ({
    acceptTrack: vi.fn(),
    musicState: { mmsTrackIds: [], rejectedTrackIds: [] },
    playTrack: vi.fn(),
    rejectTrack: vi.fn(),
  }),
}));

import { MusicDashboard } from "./music-dashboard";

it("shows retained MMS tracks when TIDAL is disconnected", () => {
  render(
    <MusicDashboard
      access={{ connectionStatus: "disconnected", isAuthenticated: true }}
      playlists={[
        { artworkUrl: null, id: "playlist-a", name: "My favorites" },
      ]}
      space="mms"
      tracks={[
        {
          album: "Discovery",
          artist: "Daft Punk",
          artworkClass: "from-violet-700 to-slate-900",
          artworkUrl: "",
          durationSeconds: 320,
          id: "saved-track",
          tidalTrackId: "776453",
          title: "One More Time",
        },
      ]}
    />,
  );

  expect(screen.getByText("One More Time")).toBeInTheDocument();
  expect(screen.getByText("My favorites")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "▶ 전체 재생" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "셔플" })).toBeEnabled();
  expect(screen.getByRole("textbox", { name: "트랙 검색" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "트랙 정렬" })).toBeInTheDocument();
  expect(screen.getByText("저장한 음악은 그대로 유지됩니다.")).toBeInTheDocument();
  expect(screen.queryByText("TIDAL 연결이 필요합니다.")).not.toBeInTheDocument();
});
