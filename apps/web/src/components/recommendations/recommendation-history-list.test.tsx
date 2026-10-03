import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { RecommendationHistoryEntry } from "@/lib/db/gms-recommendation-batches";
import { LikesProvider } from "@/providers/likes-provider";

const musicSession = vi.hoisted(() => ({
  currentTrack: null,
  playbackStatus: "idle",
  playTrack: vi.fn(),
  setQueue: vi.fn(),
}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/providers/music-session-provider", () => ({
  useMusicSession: () => musicSession,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/gms/history",
  useRouter: () => router,
}));

import { RecommendationHistoryList } from "./recommendation-history-list";

const tracks = [
  {
    decidedAt: "2026-09-29T01:00:00.000Z",
    decision: "accept" as const,
    track: {
      album: "Discovery",
      artist: "Daft Punk",
      artworkClass: "from-violet-700 to-slate-900",
      artworkUrl: "",
      id: "track-a",
      playbackAvailable: true,
      recommendation: {
        rankingVersion: "hybrid-v0" as const,
        reasonCodes: ["taste_match"],
        score: 0.9,
        scoreComponents: {
          catalogPriority: 0.8,
          diversity: 1,
          freshness: 0.7,
          matchConfidence: 0.9,
          similarity: 0.9,
        },
      },
      tidalTrackId: "tidal-a",
      title: "One More Time",
    },
  },
  {
    decidedAt: null,
    decision: null,
    track: {
      album: "Random Access Memories",
      artist: "Daft Punk",
      artworkClass: "from-amber-700 to-slate-900",
      artworkUrl: "",
      id: "track-b",
      playbackAvailable: true,
      recommendation: {
        rankingVersion: "hybrid-v0" as const,
        reasonCodes: ["taste_match"],
        score: 0.88,
        scoreComponents: {
          catalogPriority: 0.8,
          diversity: 1,
          freshness: 0.7,
          matchConfidence: 0.9,
          similarity: 0.88,
        },
      },
      tidalTrackId: "tidal-b",
      title: "Get Lucky",
    },
  },
];

const batches: RecommendationHistoryEntry[] = [{
  batchId: "batch-a",
  createdAt: "2026-09-29T00:00:00.000Z",
  rankingVersion: "hybrid-v0",
  status: "current",
  tracks,
}];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders batch and decision states", () => {
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  expect(screen.getByText("현재 추천")).toBeInTheDocument();
  expect(screen.getByText("HYBRID RANKING")).toBeInTheDocument();
  expect(screen.getByText("MMS로 보냄")).toBeInTheDocument();
  expect(screen.getByText("결정 없음")).toBeInTheDocument();
  expect(screen.getByText("One More Time")).toBeInTheDocument();
});

it("queues the tracks from their recommendation batch before playback", async () => {
  musicSession.setQueue.mockClear();
  musicSession.playTrack.mockClear();
  const user = userEvent.setup();
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "재생 Get Lucky" }));

  expect(musicSession.setQueue).toHaveBeenCalledWith(
    tracks.map(({ track }) => track),
    { id: "gms-history-batch-a", type: "gms" },
  );
  expect(musicSession.playTrack).toHaveBeenCalledWith(
    tracks[1].track,
    { id: "gms-history-batch-a", type: "gms" },
  );
});

it("keeps the track when the user cancels deletion", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "추천 이력에서 삭제 One More Time" }));

  expect(screen.getByRole("alertdialog", {name:"이 곡을 삭제할까요?"})).toHaveTextContent("삭제해도 다시 추천되지는 않습니다.");
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"취소"}));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText("One More Time")).toBeInTheDocument();
});

it("removes a confirmed track from the visible history and refreshes server data", async () => {
  const user = userEvent.setup();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "추천 이력에서 삭제 One More Time" }));

  await user.click(screen.getByRole("button",{name:"삭제"}));

  await waitFor(() => expect(screen.queryByText("One More Time")).not.toBeInTheDocument());
  expect(fetch).toHaveBeenCalledWith("/api/recommendations/history", {
    body: JSON.stringify({ batchId: "batch-a", trackId: "track-a" }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  });
  expect(router.refresh).toHaveBeenCalledOnce();
});

it("keeps the track and announces an error when deletion fails", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={batches} /></LikesProvider>);

  await user.click(screen.getByRole("button", { name: "추천 이력에서 삭제 Get Lucky" }));

  await user.click(screen.getByRole("button",{name:"삭제"}));

  expect(await screen.findByRole("alert")).toHaveTextContent("“Get Lucky” 트랙을 추천 이력에서 삭제하지 못했습니다.");
  expect(screen.getByText("Get Lucky")).toBeInTheDocument();
  expect(router.refresh).not.toHaveBeenCalled();
});

function renderHistory(items = batches) {
  return render(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={items} /></LikesProvider>);
}

it("selects tracks separately from playback and toggles all displayed tracks", async () => {
  const user = userEvent.setup();
  renderHistory();
  expect(screen.getByRole("button", {name:"선택 삭제"})).toBeDisabled();
  await user.click(screen.getByRole("checkbox", {name:"추천 이력 선택 One More Time"}));
  expect(screen.getByText("선택 1곡")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"})).toBePartiallyChecked();
  expect(musicSession.playTrack).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"}));
  expect(screen.getByText("선택 2곡")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"}));
  expect(screen.getByText("선택 0곡")).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"선택 삭제"})).toBeDisabled();
});

it("deletes the selection with one confirmation and one refresh", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValue(new Response(null, {status:204}));
  vi.stubGlobal("fetch", fetcher);
  renderHistory();
  await user.click(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"}));
  await user.click(screen.getByRole("button", {name:"선택 삭제"}));
  expect(screen.getByRole("alertdialog",{name:"선택한 2곡을 삭제할까요?"})).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"삭제"}));
  await waitFor(() => expect(screen.queryByText("Get Lucky")).not.toBeInTheDocument());
  expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual([
    {batchId:"batch-a", trackId:"track-a"}, {batchId:"batch-a", trackId:"track-b"},
  ]);
  expect(router.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent("2곡을 추천 이력에서 삭제했습니다");
  expect(screen.getByRole("button", {name:"선택 삭제"})).toBeDisabled();
});

it("keeps failed tracks selected for retry after partial deletion", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null,{status:204}))
    .mockResolvedValueOnce(new Response(null,{status:503}))
    .mockResolvedValueOnce(new Response(null,{status:204}));
  vi.stubGlobal("fetch", fetcher);
  renderHistory();
  await user.click(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"}));
  await user.click(screen.getByRole("button", {name:"선택 삭제"}));
  await user.click(screen.getByRole("button",{name:"삭제"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("1곡을 삭제하지 못했습니다");
  expect(screen.queryByText("One More Time")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", {name:"추천 이력 선택 Get Lucky"})).toBeChecked();
  expect(screen.getByText("선택 1곡")).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"선택 삭제"}));
  await user.click(screen.getByRole("button",{name:"삭제"}));
  await waitFor(() => expect(screen.queryByText("Get Lucky")).not.toBeInTheDocument());
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(router.refresh).toHaveBeenCalledTimes(2);
});

it("preserves selection on cancellation and network errors", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  renderHistory();
  const selected = screen.getByRole("checkbox", {name:"추천 이력 선택 Get Lucky"});
  await user.click(selected);
  await user.click(screen.getByRole("button", {name:"선택 삭제"}));
  await user.click(screen.getByRole("button",{name:"취소"}));
  expect(fetcher).not.toHaveBeenCalled();
  expect(selected).toBeChecked();
  await user.click(screen.getByRole("button", {name:"선택 삭제"}));
  await user.click(screen.getByRole("button",{name:"삭제"}));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(selected).toBeChecked();
  expect(router.refresh).not.toHaveBeenCalled();
});

it("serializes selection deletion and blocks conflicting controls while pending", async () => {
  const user = userEvent.setup();
  let complete!: (response:Response) => void;
  const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(resolve=>{complete=resolve;}))
    .mockResolvedValue(new Response(null,{status:204}));
  vi.stubGlobal("fetch",fetcher);
  renderHistory();
  await user.click(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"}));
  await user.click(screen.getByRole("button", {name:"선택 삭제"}));
  await user.click(screen.getByRole("button",{name:"삭제"}));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("checkbox", {name:"표시된 곡 전체 선택"})).toBeDisabled();
  expect(screen.getByRole("button", {name:"추천 이력에서 삭제 Get Lucky"})).toBeDisabled();
  await user.click(screen.getByRole("button", {name:/삭제 중/}));
  expect(fetcher).toHaveBeenCalledTimes(1);
  complete(new Response(null,{status:204}));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect(router.refresh).toHaveBeenCalledTimes(1));
});

it("scopes equal track IDs to their batch and ignores selections from other pages", async () => {
  const user = userEvent.setup();
  const view = renderHistory();
  await user.click(screen.getByRole("checkbox", {name:"추천 이력 선택 One More Time"}));
  view.rerender(<LikesProvider initialLikes={[]} isAuthenticated><RecommendationHistoryList batches={[{...batches[0],batchId:"batch-b"}]} /></LikesProvider>);
  expect(screen.getByText("선택 0곡")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", {name:"추천 이력 선택 One More Time"})).not.toBeChecked();
  expect(screen.getByRole("button", {name:"선택 삭제"})).toBeDisabled();
  await user.click(screen.getByRole("checkbox", {name:"추천 이력 선택 One More Time"}));
  expect(screen.getByText("선택 1곡")).toBeInTheDocument();
});

it("focuses cancel, traps Tab in the template dialog, and restores focus and scrolling on Escape", async () => {
  const user = userEvent.setup();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch",fetcher);
  renderHistory();
  await user.click(screen.getByRole("checkbox",{name:"표시된 곡 전체 선택"}));
  const trigger = screen.getByRole("button",{name:"선택 삭제"});
  await user.click(trigger);
  const cancel = screen.getByRole("button",{name:"취소"});
  const confirm = screen.getByRole("button",{name:"삭제"});
  expect(cancel).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  await user.tab();
  expect(confirm).toHaveFocus();
  await user.tab();
  expect(cancel).toHaveFocus();
  await user.tab({shift:true});
  expect(confirm).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(screen.getByText("선택 2곡")).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});
