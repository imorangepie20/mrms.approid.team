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
const trackC: PlayableTrack = {
  ...trackA,
  id: "c",
  tidalTrackId: "tidal-c",
  title: "Track C",
};
const unavailableTrack: PlayableTrack = {
  ...trackA,
  id: "unavailable",
  playbackAvailable: false,
  tidalTrackId: "tidal-unavailable",
  title: "Unavailable Track",
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
    setVolume: vi.fn().mockResolvedValue(undefined),
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
      <button type="button" onClick={() => session.setQueue([trackA, trackB, trackC], { id: "three", type: "search" })}>
        Three queue
      </button>
      <button type="button" onClick={() => session.setQueue([trackA, unavailableTrack, trackC], { id: "unavailable", type: "search" })}>
        Queue with unavailable
      </button>
      <button type="button" onClick={() => void session.playQueueIndex(0)}>
        First duplicate
      </button>
      <button type="button" onClick={() => void session.nextTrack()}>
        Next
      </button>
      <button type="button" onClick={session.cycleRepeatMode}>Repeat</button>
      <button type="button" onClick={session.toggleShuffle}>Shuffle</button>
      <button type="button" onClick={() => void session.setVolume(35)}>Volume 35</button>
      <button type="button" onClick={() => void session.toggleMute()}>Mute</button>
      <button type="button" onClick={() => void session.pausePlayback()}>Pause</button>
      <p>Now playing: {session.currentTrack?.title ?? "nothing"}</p>
      <p>Index: {session.currentIndex ?? "none"}</p>
      <p>Status: {session.playbackStatus}</p>
      <p>Repeat: {session.repeatMode}</p>
      <p>Shuffle: {String(session.shuffleEnabled)}</p>
      <p>Volume: {session.volume}</p>
      <p>Queue: {session.queue.map((item) => item.track.title).join(", ")}</p>
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

  it("repeats the queue boundary and the current track", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Duplicate queue" }));
    await user.click(screen.getByRole("button", { name: "First duplicate" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Repeat" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Index: 0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Repeat" }));
    const referenceId = vi.mocked(engine.load).mock.calls.at(-1)?.[1].referenceId ?? null;
    act(() => engine.emit({ type: "ended", reason: "completed", referenceId }));
    await waitFor(() => expect(engine.load).toHaveBeenCalledTimes(4));
    expect(screen.getByText("Index: 0")).toBeInTheDocument();
  });

  it("shuffles upcoming tracks while keeping the current track first", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Three queue" }));
    await user.click(screen.getByRole("button", { name: "First duplicate" }));
    await user.click(screen.getByRole("button", { name: "Shuffle" }));

    expect(screen.getByText("Shuffle: true")).toBeInTheDocument();
    expect(screen.getByText("Queue: Track A, Track C, Track B")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("excludes unavailable tracks from the playback queue", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Queue with unavailable" }));

    expect(screen.getByText("Queue: Track A, Track C")).toBeInTheDocument();
  });

  it("sets volume and restores it after mute", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Volume 35" }));
    await user.click(screen.getByRole("button", { name: "Mute" }));
    await user.click(screen.getByRole("button", { name: "Mute" }));

    expect(engine.setVolume).toHaveBeenNthCalledWith(1, 35);
    expect(engine.setVolume).toHaveBeenNthCalledWith(2, 0);
    expect(engine.setVolume).toHaveBeenNthCalledWith(3, 35);
    expect(screen.getByText("Volume: 35")).toBeInTheDocument();
  });

  it("exposes an explicit playback pause action", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <SessionHarness />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(engine.pause).toHaveBeenCalledOnce();
  });
});
