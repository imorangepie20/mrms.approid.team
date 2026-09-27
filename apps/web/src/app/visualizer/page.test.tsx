import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  session: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mocks.back, replace: mocks.replace }),
}));
vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => mocks.session,
}));
vi.mock("@/hooks/use-tidal-audio-analyser", () => ({
  useTidalAudioAnalyser: () => ({ binCount: 128, mode: "pcm", read: vi.fn() }),
}));
vi.mock("@/components/player/visual-equalizer-canvas", () => ({
  VisualEqualizerCanvas: ({ mode }: { mode: string }) => <div data-testid="visualizer-canvas">{mode}</div>,
}));

import VisualizerPage from "./page";

const track = {
  album: "Album",
  artist: "Artist",
  artworkClass: "from-violet-500 to-sky-500",
  artworkUrl: "",
  durationSeconds: 185,
  id: "track-a",
  tidalTrackId: "42",
  title: "Track A",
};

function session(currentTrack: typeof track | null = track) {
  return {
    currentIndex: currentTrack ? 0 : null,
    currentTrack,
    durationSeconds: 185,
    isPlaying: true,
    nextTrack: vi.fn(),
    playbackError: null,
    playbackPosition: 42,
    playQueueIndex: vi.fn(),
    previousTrack: vi.fn(),
    queue: currentTrack ? [{ referenceId: "ref-a", source: { id: "search", type: "search" }, track }] : [],
    seek: vi.fn(),
    togglePlayback: vi.fn(),
  };
}

describe("VisualizerPage", () => {
  beforeEach(() => {
    mocks.back.mockClear();
    mocks.replace.mockClear();
    mocks.session = session();
  });

  it("renders the current track, switches modes, and shares playback controls", async () => {
    const user = userEvent.setup();
    render(<VisualizerPage />);

    expect(screen.getByRole("heading", { name: "Track A" })).toBeInTheDocument();
    expect(screen.getByTestId("visualizer-canvas")).toHaveTextContent("bars");
    await user.click(screen.getByRole("button", { name: "방사형" }));
    expect(screen.getByTestId("visualizer-canvas")).toHaveTextContent("radial");
    await user.click(screen.getByRole("button", { name: "일시 정지" }));
    expect((mocks.session as ReturnType<typeof session>).togglePlayback).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("slider", { name: "재생 위치" }), { target: { value: "60" } });
    expect((mocks.session as ReturnType<typeof session>).seek).toHaveBeenCalledWith(60);
  });

  it("returns home when no TIDAL track is active", async () => {
    mocks.session = session(null);
    render(<VisualizerPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
  });

  it("shows a login action instead of a perpetual analysis loading state", () => {
    mocks.session = { ...session(), playbackError: "unauthorized" };
    render(<VisualizerPage />);
    expect(screen.getByRole("status")).toHaveTextContent("로그인 후 실시간 이퀄라이저를 사용할 수 있습니다.");
    expect(screen.getByRole("link", { name: "로그인 후 재생" })).toHaveAttribute(
      "href",
      "/api/auth/login?returnTo=%2Fvisualizer",
    );
  });
});
