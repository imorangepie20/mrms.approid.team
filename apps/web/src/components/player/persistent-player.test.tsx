import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  PlaybackEngine,
  PlaybackEvent,
  PlayableTrack,
} from "@/lib/tidal/player";
import {
  MusicSessionProvider,
  useMusicSession,
} from "@/providers/music-session-provider";

import { PersistentPlayer } from "./persistent-player";

const track: PlayableTrack = {
  album: "Album",
  artist: "Artist",
  artworkClass: "from-violet-500 to-sky-500",
  artworkUrl: "",
  durationSeconds: 185,
  id: "track-a",
  tidalTrackId: "tidal-a",
  title: "Track A",
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

function PlaybackStarter() {
  const { playTrack } = useMusicSession();
  return (
    <button
      type="button"
      onClick={() => void playTrack(track, { id: "search", type: "search" })}
    >
      Start playback
    </button>
  );
}

describe("PersistentPlayer", () => {
  it("does not report playing until the engine emits playing", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <PlaybackStarter />
        <PersistentPlayer />
      </MusicSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Start playback" }));
    expect(screen.getByRole("button", { name: "재생" })).toBeInTheDocument();
    act(() => engine.emit({ type: "state", state: "playing" }));
    expect(screen.getByRole("button", { name: "일시 정지" })).toBeInTheDocument();
  });

  it("seeks in seconds and opens the shared full player", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <PlaybackStarter />
        <PersistentPlayer />
      </MusicSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Start playback" }));
    act(() => {
      engine.emit({ type: "duration", durationSeconds: 185 });
      engine.emit({ type: "position", positionSeconds: 42 });
    });

    const slider = screen.getByRole("slider", { name: "재생 위치" });
    expect(slider).toHaveAttribute("max", "185");
    expect(slider).toHaveValue("42");
    fireEvent.change(slider, { target: { value: "60" } });
    expect(engine.seek).toHaveBeenCalledWith(60);

    await user.click(screen.getByRole("button", { name: /now playing track a/i }));
    expect(
      screen.getByRole("dialog", { name: "전체 화면 플레이어" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("0:42").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3:05").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Track A 재생 중" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("controls shuffle, repeat, and volume from the persistent player", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <PlaybackStarter />
        <PersistentPlayer />
      </MusicSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Start playback" }));

    const shuffle = screen.getByRole("button", { name: "셔플 켜기" });
    await user.click(shuffle);
    expect(screen.getByRole("button", { name: "셔플 끄기" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "반복 끔" }));
    expect(screen.getByRole("button", { name: "전체 반복" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "볼륨" }), {
      target: { value: "35" },
    });
    expect(engine.setVolume).toHaveBeenCalledWith(35);
    await user.click(screen.getByRole("button", { name: "음소거" }));
    expect(engine.setVolume).toHaveBeenCalledWith(0);
  });

  it("pauses SDK playback before opening the TIDAL player", async () => {
    const engine = fakeEngine();
    const user = userEvent.setup();
    render(
      <MusicSessionProvider engine={engine}>
        <PlaybackStarter />
        <PersistentPlayer />
      </MusicSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Start playback" }));

    await user.click(screen.getByRole("button", { name: "TIDAL 전체 재생" }));

    expect(engine.pause).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "TIDAL 플레이어" })).toBeInTheDocument();
    expect(screen.getByTitle("Track A TIDAL 플레이어")).toHaveAttribute(
      "src",
      "https://embed.tidal.com/tracks/tidal-a",
    );
  });
});
