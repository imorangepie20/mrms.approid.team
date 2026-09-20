import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { catalog } from "@/lib/music/fixtures";

import { MusicSessionProvider, useMusicSession } from "./music-session-provider";

function RouteOne() {
  const { playTrack } = useMusicSession();

  return (
    <button type="button" onClick={() => playTrack(catalog[0])}>
      Play Midnight City
    </button>
  );
}

function NowPlaying() {
  const { currentTrack, playbackPosition, setPlaybackPosition } = useMusicSession();

  return (
    <>
      <p>Now playing: {currentTrack?.title ?? "nothing"}</p>
      <p>Position: {playbackPosition}</p>
      <button type="button" onClick={() => setPlaybackPosition(42)}>
        Set position
      </button>
    </>
  );
}

function ProviderHarness() {
  const [isFirstRoute, setIsFirstRoute] = useState(true);

  return (
    <MusicSessionProvider>
      {isFirstRoute ? <RouteOne /> : <p>Second route</p>}
      <NowPlaying />
      <button type="button" onClick={() => setIsFirstRoute(false)}>
        Switch route
      </button>
    </MusicSessionProvider>
  );
}

describe("MusicSessionProvider", () => {
  it("keeps the playing track when a child route unmounts", async () => {
    const user = userEvent.setup();

    render(<ProviderHarness />);

    await user.click(screen.getByRole("button", { name: /play midnight city/i }));
    await user.click(screen.getByRole("button", { name: /set position/i }));
    expect(screen.getByText(/now playing: midnight city/i)).toBeInTheDocument();
    expect(screen.getByText("Position: 42")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /switch route/i }));
    expect(screen.getByText(/now playing: midnight city/i)).toBeInTheDocument();
    expect(screen.getByText("Position: 42")).toBeInTheDocument();
  });
});
