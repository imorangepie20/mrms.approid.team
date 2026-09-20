import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type {
  PlaybackEngine,
  PlaybackEvent,
  PlayableTrack,
} from "@/lib/tidal/player";

import { MusicSessionProvider, useMusicSession } from "./music-session-provider";

const trackA: PlayableTrack = {
  album: "Album",
  artist: "Artist",
  artworkClass: "from-violet-500 to-sky-500",
  artworkUrl: "",
  durationSeconds: 180,
  id: "a",
  tidalTrackId: "tidal-a",
  title: "Track A",
};
const trackB: PlayableTrack = {
  ...trackA,
  id: "b",
  tidalTrackId: "tidal-b",
  title: "Track B",
};

function fakeEngine() {
  const listeners = new Set<(event: PlaybackEvent) => void>();
  const engine: PlaybackEngine & { emit(event: PlaybackEvent): void } = {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    setNext: vi.fn().mockResolvedValue(undefined),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      listeners.forEach((listener) => listener(event));
    },
  };
  return engine;
}

function SessionHarness() {
  const session = useMusicSession();
  const [isFirstRoute, setIsFirstRoute] = useState(true);
  return (
    <>
      {isFirstRoute ? (
        <button
          type="button"
          onClick={() => void session.playTrack(trackA, { id: "test", type: "search" })}
        >
          재생 Track A
        </button>
      ) : (
        <p>Second route</p>
      )}
      <button
        type="button"
        onClick={() => void session.playTrack(trackB, { id: "test", type: "search" })}
      >
        재생 Track B
      </button>
      <button type="button" onClick={() => setIsFirstRoute(false)}>
        Switch route
      </button>
      <button type="button" onClick={() => session.setQueue([trackA, trackA], { id: "duplicates", type: "search" })}>
        Duplicate queue
      </button>
      <button type="button" onClick={() => void session.playQueueIndex(0)}>
        First duplicate
      </button>
      <button type="button" onClick={() => void session.nextTrack()}>
        Next
      </button>
      <p>Now playing: {session.currentTrack?.title ?? "nothing"}</p>
      <p>Index: {session.currentIndex ?? "none"}</p>
      <p>Status: {session.playbackStatus}</p>
    </>
  );
}

describe("MusicSessionProvider", () => {
  it("keeps the current track when child route content unmounts", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "재생 Track A" }));
    await user.click(screen.getByRole("button", { name: "Switch route" }));

    expect(screen.getByText("Now playing: Track A")).toBeInTheDocument();
  });

  it("ignores a late load completion from an older track", async () => {
    const engine = fakeEngine();
    let resolveA!: () => void;
    vi.mocked(engine.load).mockImplementation((track) =>
      track.tidalTrackId === "tidal-a"
        ? new Promise<void>((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve(),
    );
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "재생 Track A" }));
    await user.click(screen.getByRole("button", { name: "재생 Track B" }));
    act(() => resolveA());

    expect(screen.getByText("Now playing: Track B")).toBeInTheDocument();
    await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
  });

  it("moves through duplicate track IDs by queue index and reference ID", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Duplicate queue" }));
    await user.click(screen.getByRole("button", { name: "First duplicate" }));
    const firstReference = vi.mocked(engine.load).mock.calls[0]?.[1].referenceId;
    await user.click(screen.getByRole("button", { name: "Next" }));
    const secondReference = vi.mocked(engine.load).mock.calls[1]?.[1].referenceId;

    expect(screen.getByText("Index: 1")).toBeInTheDocument();
    expect(firstReference).not.toBe(secondReference);
  });

  it("advances on ended and becomes idle after the final queue item", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Duplicate queue" }));
    await user.click(screen.getByRole("button", { name: "First duplicate" }));
    const firstReference = vi.mocked(engine.load).mock.calls[0]?.[1].referenceId;

    act(() => engine.emit({ type: "ended", reason: "completed", referenceId: firstReference }));
    await screen.findByText("Index: 1");
    const secondReference = vi.mocked(engine.load).mock.calls[1]?.[1].referenceId;
    act(() => engine.emit({ type: "ended", reason: "completed", referenceId: secondReference }));

    expect(await screen.findByText("Status: idle")).toBeInTheDocument();
  });
});
