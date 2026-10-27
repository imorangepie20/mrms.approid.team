import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  getBatch: vi.fn(),
  getHistory: vi.fn(),
  getConnection: vi.fn(),
  getSession: vi.fn(),
  recordShadow: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));
vi.mock("@/lib/auth/auth0", () => ({
  auth0: { getSession: mocks.getSession },
}));
vi.mock("@/lib/db/user-connections", () => ({
  getUserConnection: mocks.getConnection,
}));
vi.mock("@/lib/db/gms-recommendations", () => ({
  recordRecommendationShadow: mocks.recordShadow,
}));
vi.mock("@/lib/db/gms-recommendation-batches", () => ({
  getOrCreatePersonalizedRecommendationBatch: mocks.getBatch,
  getAllPersonalizedRecommendationHistory: mocks.getHistory,
}));
vi.mock("@/components/dashboard/music-dashboard", () => ({
  MusicDashboard: (props: {
    recommendationHistory: Array<{batchId: string}>;
    recommendationError: boolean;
    recommendationBatchId: string | null;
    recommendationExhausted: boolean;
    profileVersion: string;
    recommendationReady: boolean;
    tracks: Array<{ id: string }>;
  }) => (
    <div data-testid="gms-dashboard">
      {props.profileVersion}:{String(props.recommendationReady)}:{props.recommendationBatchId}:{String(props.recommendationExhausted)}:{props.tracks.map((track) => track.id).join(",")}
      <span data-testid="groups">{props.recommendationHistory.map(({batchId}) => batchId).join(",")}</span>
      <span data-testid="error">{String(props.recommendationError)}</span>
    </div>
  ),
}));

import GmsPage from "./page";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("GMS page recommendation serving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    process.env.DATABASE_URL = "postgres://test";
    mocks.after.mockImplementation((callback: () => unknown) => {
      mocks.afterCallbacks.push(callback);
    });
    mocks.getSession.mockResolvedValue({ user: { sub: "auth0|listener" } });
    mocks.getConnection.mockResolvedValue({ status: "connected" });
    mocks.getBatch.mockResolvedValue({
      batchId: "f17870e2-b297-4451-adf5-9856f257b720",
      createdAt: "2026-09-29T00:00:00.000Z",
      exhausted: false,
      newlyCreated: true,
      recommendations: {
        profileReady: true,
        profileVersion: "ems-v1",
        rankingVersion: "baseline",
        tracks: [{ id: "track-a" }],
      },
      shadow: { rankingVersion: "hybrid-v0" },
      serving: {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
    });
    mocks.recordShadow.mockResolvedValue(undefined);
    mocks.getHistory.mockResolvedValue([{batchId:"current"},{batchId:"past"}]);
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("renders the selected ranking and records its provenance after the response", async () => {
    render(await GmsPage());

    expect(screen.getByTestId("gms-dashboard")).toHaveTextContent(
      "ems-v1:true:f17870e2-b297-4451-adf5-9856f257b720:false:track-a",
    );
    expect(mocks.getBatch).toHaveBeenCalledWith("auth0|listener", 12);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.afterCallbacks[0]?.();
    expect(mocks.recordShadow).toHaveBeenCalledWith(
      "auth0|listener",
      { rankingVersion: "hybrid-v0" },
      {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
    );
  });

  it("keeps the rendered recommendation when the after-response write fails", async () => {
    mocks.recordShadow.mockRejectedValue(new Error("shadow unavailable"));

    render(await GmsPage());

    expect(screen.getByTestId("gms-dashboard")).toHaveTextContent("track-a");
    await expect(mocks.afterCallbacks[0]?.()).resolves.toBeUndefined();
  });


it("loads all current and past groups for the signed in listener", async () => {
  render(await GmsPage());
  expect(mocks.getHistory).toHaveBeenCalledWith("auth0|listener");
  expect(screen.getByTestId("groups")).toHaveTextContent("current,past");
});
it("does not query private recommendations without access", async () => {
  mocks.getSession.mockResolvedValueOnce(null);
  await GmsPage();
  mocks.getConnection.mockResolvedValueOnce({status:"reauthentication_required"});
  await GmsPage();
  expect(mocks.getBatch).not.toHaveBeenCalled();
  expect(mocks.getHistory).not.toHaveBeenCalled();
});
it("reports history load failures instead of showing incomplete groups", async () => {
  mocks.getHistory.mockRejectedValueOnce(new Error("offline"));
  render(await GmsPage());
  expect(screen.getByTestId("error")).toHaveTextContent("true");
});

});
