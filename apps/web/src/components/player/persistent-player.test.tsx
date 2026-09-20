import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { catalog } from "@/lib/music/fixtures";
import {
  MusicSessionProvider,
  useMusicSession,
} from "@/providers/music-session-provider";

import { PersistentPlayer } from "./persistent-player";

function PlaybackStarter() {
  const { playTrack } = useMusicSession();

  return (
    <button type="button" onClick={() => playTrack(catalog[0])}>
      Start playback
    </button>
  );
}

describe("PersistentPlayer", () => {
  it("opens the full player from the persistent player", async () => {
    const user = userEvent.setup();

    render(
      <MusicSessionProvider>
        <PlaybackStarter />
        <PersistentPlayer />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start playback" }));
    await user.click(
      screen.getByRole("button", { name: /now playing midnight city/i }),
    );

    expect(
      screen.getByRole("dialog", { name: "전체 화면 플레이어" }),
    ).toBeInTheDocument();
  });
});
