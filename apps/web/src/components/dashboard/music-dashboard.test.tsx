import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { LikeItem } from "@/lib/likes/types";
import { catalog } from "@/lib/music/fixtures";
import { LikesProvider } from "@/providers/likes-provider";

const session = vi.hoisted(() => ({
  acceptTrack: vi.fn(),
  isAuthenticated: true,
  musicState: { mmsTrackIds: [], rejectedTrackIds: [] },
  playTrack: vi.fn(),
  rejectTrack: vi.fn(),
  setQueue: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/gms",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => session,
}));

import { MusicDashboard } from "./music-dashboard";

function renderDashboard(node: React.ReactNode, initialLikes: LikeItem[] = []) {
  return render(
    <LikesProvider initialLikes={initialLikes} isAuthenticated>{node}</LikesProvider>,
  );
}

it("renders the top three real EMS editorial sections without fixtures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    totalCount: 54,
    sections: [
      {
        slug: "new-releases",
        title: "신곡 퍼레이드",
        description: "지금 막 도착한 새로운 음악",
        tracks: [{
          album: "Discovery",
          artist: "Daft Punk",
          artworkClass: "from-violet-700 to-slate-900",
          artworkUrl: "",
          id: "track-a",
          tidalTrackId: "tidal-a",
          title: "One More Time",
        }],
      },
      {
        slug: "seasonal-jazz",
        title: "시원한 가을 바람과 함께, 재즈",
        description: "여유로운 재즈 셀렉션",
        tracks: [],
      },
      {
        slug: "night-rnb",
        title: "도시의 밤을 채우는 R&B",
        description: "늦은 시간에 어울리는 부드러운 트랙",
        tracks: [],
      },
    ],
  })));

  renderDashboard(<MusicDashboard space="home" />);

  expect(
    await screen.findByRole("heading", { name: "신곡 퍼레이드" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "EMS에서 더 보기" })).toHaveLength(3);
  expect(screen.queryByText("Midnight Frequencies")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("sectionLimit=3"),
    expect.anything(),
  );
});

it("shows liked MMS content when TIDAL is disconnected", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "disconnected", isAuthenticated: true }}
      space="mms"
    />,
    [
      {
        artworkUrl: "",
        createdAt: "2026-09-21T00:00:00.000Z",
        entityType: "track",
        metadata: {
          album: "Discovery",
          durationSeconds: 320,
          playbackAvailable: true,
        },
        source: "tidal",
        sourceId: "776453",
        subtitle: "Daft Punk",
        title: "One More Time",
      },
      {
        artworkUrl: "",
        createdAt: "2026-09-21T00:00:00.000Z",
        entityType: "playlist",
        metadata: { trackCount: 12 },
        source: "tidal",
        sourceId: "playlist-a",
        subtitle: "12 tracks",
        title: "My favorites",
      },
    ],
  );

  expect(screen.getByText("One More Time")).toBeInTheDocument();
  expect(screen.getByText("My favorites")).toBeInTheDocument();
  expect(screen.getByTestId("liked-track-count")).toHaveTextContent("1");
  expect(screen.getByText("좋아요는 그대로 유지됩니다.")).toBeInTheDocument();
  expect(screen.queryByText("TIDAL 연결이 필요합니다.")).not.toBeInTheDocument();
});

it("keeps GMS recommendation decisions separate from persistent hearts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    item: {
      artworkUrl: "https://images.unsplash.com/track.jpg",
      createdAt: "2026-09-21T00:00:00.000Z",
      entityType: "track",
      metadata: { album: "Hurry Up, We're Dreaming", playbackAvailable: true },
      source: "catalog",
      sourceId: "t-1",
      subtitle: "M83",
      title: "Midnight City",
    },
    liked: true,
  })));
  const user = userEvent.setup();
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      space="gms"
      recommendationReady
      tracks={[catalog[0]]}
    />,
  );

  expect(screen.getAllByRole("button", { name: "추천 수락" })).not.toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "좋아요 Midnight City" }));

  expect(session.acceptTrack).not.toHaveBeenCalled();
  expect(session.rejectTrack).not.toHaveBeenCalled();
  expect(session.playTrack).not.toHaveBeenCalled();
});

it("does not fall back to fixture tracks when personalized recommendations are unavailable", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      space="gms"
    />,
  );

  expect(screen.getByText("취향 분석이 완료되면 개인화 추천이 표시됩니다.")).toBeInTheDocument();
  expect(screen.queryByText("Midnight City")).not.toBeInTheDocument();
});

it("gives the GMS profile-not-ready state a clear next step", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      space="gms"
    />,
  );

  expect(
    screen.getByRole("heading", { name: "당신을 위한 추천을 준비하고 있어요" }),
  ).toBeInTheDocument();
  expect(screen.getByText("취향 분석이 완료되면 개인화 추천이 표시됩니다.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "취향 분석 시작하기" })).toHaveAttribute(
    "href",
    "/onboarding",
  );
});

it("explains when a ready profile has no remaining recommendation candidates", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      recommendationReady
      space="gms"
      tracks={[]}
    />,
  );

  expect(screen.getByText("지금은 새로 추천할 곡이 없습니다.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "EMS 카탈로그 둘러보기" })).toHaveAttribute("href", "/ems");
});

it("persists GMS decisions separately from the MMS like action", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      recommendationReady
      space="gms"
      tracks={[{
        ...catalog[0],
        id: "ems-track-a",
        recommendation: {
          reasonCodes: ["taste_match"],
          score: 0.91,
          scoreComponents: {
            catalogPriority: 0.8,
            diversity: 1,
            freshness: 0.7,
            matchConfidence: 0.9,
            similarity: 0.88,
          },
        },
      }]}
    />,
  );

  await user.click(screen.getByRole("button", { name: "추천 수락" }));

  expect(fetcher).toHaveBeenCalledWith(
    "/api/recommendations/decisions",
    expect.objectContaining({ method: "POST" }),
  );
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    decision: "accept",
    sourceTrackId: "ems-track-a",
  });
  vi.unstubAllGlobals();
});

it("shows concise recommendation reasons on GMS cards", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      recommendationReady
      space="gms"
      tracks={[{
        ...catalog[0],
        id: "ems-track-reason",
        recommendation: {
          reasonCodes: ["taste_match", "fresh_release"],
          score: 0.92,
          scoreComponents: {
            catalogPriority: 0.8,
            diversity: 1,
            freshness: 0.95,
            matchConfidence: 0.9,
            similarity: 0.9,
          },
        },
      }]}
    />,
  );

  expect(screen.getByRole("region", { name: "GMS 추천" })).toBeInTheDocument();
  expect(screen.getByRole("article")).toHaveClass("gateway-card--fixed");
  expect(screen.getByText("취향 일치")).toBeInTheDocument();
  expect(screen.getByText("최근 발매")).toBeInTheDocument();
});

it("renders the GMS play action with a visual icon hook", () => {
  renderDashboard(
    <MusicDashboard
      access={{ connectionStatus: "connected", isAuthenticated: true }}
      recommendationReady
      space="gms"
      tracks={[catalog[0]]}
    />,
  );

  expect(
    screen.getByRole("button", { name: "Midnight City 재생" }).querySelector(".play-icon"),
  ).toBeInTheDocument();
});
