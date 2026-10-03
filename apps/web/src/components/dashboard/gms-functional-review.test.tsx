import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LikesProvider } from "@/providers/likes-provider";
import { catalog } from "@/lib/music/fixtures";

const session = vi.hoisted(() => ({
  acceptTrack: vi.fn(), rejectTrack: vi.fn(), playTrack: vi.fn(), setQueue: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("@/providers/music-session-provider", () => ({ useMusicSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/gms" }));
import { MusicDashboard } from "./music-dashboard";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function renderGms() {
  render(<LikesProvider isAuthenticated initialLikes={[]}>
    <MusicDashboard access={{isAuthenticated:true,connectionStatus:"connected"}}
      recommendationReady space="gms" tracks={[catalog[0]]} />
  </LikesProvider>);
}

it("retains the decision and announces HTTP save failure without mutating preferences", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({code:"decision_unavailable"}, {status:503})));
  renderGms();
  await userEvent.setup().click(screen.getByRole("button", {name:"+ MMS"}));
  await waitFor(() => expect(session.acceptTrack).not.toHaveBeenCalled());
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("status", {name:"추가되었습니다"})).not.toBeInTheDocument();
});

it("keeps a successfully decided track in its group with the saved state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null,{status:204})));
  renderGms();
  await userEvent.setup().click(screen.getByRole("button", {name:"싫어요"}));
  await waitFor(() => expect(screen.getByRole("button", {name:"재생 Midnight City"})).toBeInTheDocument());
  expect(session.rejectTrack).toHaveBeenCalledTimes(1);
  expect(navigation.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", {name:/결정 대기 0곡/})).toBeInTheDocument();
  expect(screen.queryByRole("status", {name:"추가되었습니다"})).not.toBeInTheDocument();
});

it("blocks duplicate and conflicting decisions while saving", async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetcher);
  renderGms();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name:"+ MMS"}));
  await user.click(screen.getByRole("button", {name:"싫어요"}));
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("preserves the row on network failure and allows retry", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(null, {status:204}));
  vi.stubGlobal("fetch", fetcher);
  renderGms();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", {name:"+ MMS"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(screen.getByRole("button", {name:"재생 Midnight City"})).toBeInTheDocument();
  expect(session.acceptTrack).not.toHaveBeenCalled();
  expect(screen.queryByRole("status", {name:"추가되었습니다"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"+ MMS"}));
  await waitFor(() => expect(session.acceptTrack).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("commits a saved decision while announcing a profile-refresh failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    code:"taste_profile_refresh_failed", decisionSaved:true,
  }, {status:503})));
  renderGms();
  await userEvent.setup().click(screen.getByRole("button", {name:"+ MMS"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("결정은 저장했습니다");
  expect(session.acceptTrack).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", {name:"재생 Midnight City"})).toBeInTheDocument();
  expect(navigation.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status", {name:"추가되었습니다"})).toBeInTheDocument();
});

it("does not apply a preference before the server confirms it and blocks batch refresh", async () => {
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete=resolve; })));
  render(<LikesProvider isAuthenticated initialLikes={[]}>
    <MusicDashboard access={{isAuthenticated:true,connectionStatus:"connected"}}
      recommendationBatchId="f17870e2-b297-4451-adf5-9856f257b720"
      recommendationReady space="gms" tracks={[catalog[0]]} />
  </LikesProvider>);
  await userEvent.setup().click(screen.getByRole("button", {name:"+ MMS"}));
  expect(session.acceptTrack).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name:"싫어요"})).toBeDisabled();
  expect(screen.getByRole("button", {name:"다시 추천 받기"})).toBeDisabled();
  expect(screen.queryByRole("status", {name:"추가되었습니다"})).not.toBeInTheDocument();
  complete(new Response(null, {status:204}));
  await waitFor(() => expect(session.acceptTrack).toHaveBeenCalledTimes(1));
});

it("announces a successful MMS addition with a link to the saved library", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {status:204})));
  renderGms();
  await userEvent.setup().click(screen.getByRole("button", {name:"+ MMS"}));
  expect(await screen.findByRole("status", {name:""})).toHaveTextContent("Midnight City");
  expect(screen.getByRole("status", {name:""})).toHaveTextContent("MMS에 추가했습니다");
  expect(screen.getByRole("link", {name:"MMS 보기"})).toHaveAttribute("href", "/mms");
  expect(screen.getByRole("status", {name:"추가되었습니다"})).toBeInTheDocument();
});

it("closes the template success notification without removing the saved-library link", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null,{status:204})));
  renderGms();
  await userEvent.setup().click(screen.getByRole("button",{name:"+ MMS"}));
  expect(screen.getByRole("status",{name:"추가되었습니다"})).toHaveClass("template-success-toast");
  await userEvent.setup().click(screen.getByRole("button",{name:"알림 닫기"}));
  expect(screen.queryByRole("status",{name:"추가되었습니다"})).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"MMS 보기"})).toBeInTheDocument();
});

it("keeps past undecided tracks actionable with their original profile version", async () => {
  const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:204})); vi.stubGlobal("fetch",fetcher);
  render(<LikesProvider initialLikes={[]} isAuthenticated><MusicDashboard space="gms" access={{isAuthenticated:true,connectionStatus:"connected"}} recommendationReady profileVersion="new-profile" recommendationBatchId="current-batch" recommendationHistory={[{batchId:"past-batch",createdAt:"2026-10-03T00:00:00Z",profileVersion:"original-profile",rankingVersion:"baseline",status:"replaced",tracks:[{track:catalog[0],decision:null,decidedAt:null}]}]}/></LikesProvider>);
  await userEvent.setup().click(screen.getByRole("button",{name:"+ MMS"}));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({profileVersion:"original-profile",sourceTrackId:catalog[0].id});
  expect(screen.getByText("MMS로 보냄")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"추천 이력에서 삭제 Midnight City"})).toBeInTheDocument();
});
