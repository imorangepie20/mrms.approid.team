import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  getConnection: vi.fn(),
  getSession: vi.fn(),
  prepare: vi.fn(),
  recordShadow: vi.fn(),
  select: vi.fn(),
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
  preparePersonalizedEmsRecommendations: mocks.prepare,
  recordRecommendationShadow: mocks.recordShadow,
  selectPreparedPersonalizedRecommendations: mocks.select,
}));
vi.mock("@/components/dashboard/music-dashboard", () => ({
  MusicDashboard: (props: {
    profileVersion: string;
    recommendationReady: boolean;
    tracks: Array<{ id: string }>;
  }) => (
    <div data-testid="gms-dashboard">
      {props.profileVersion}:{String(props.recommendationReady)}:{props.tracks.map((track) => track.id).join(",")}
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
    mocks.prepare.mockResolvedValue({
      hybridRecommendations: null,
      recommendations: {
        profileReady: true,
        profileVersion: "ems-v1",
        rankingVersion: "baseline",
        tracks: [{ id: "track-a" }],
      },
      shadow: { rankingVersion: "hybrid-v0" },
    });
    mocks.select.mockReturnValue({
      recommendations: {
        profileReady: true,
        profileVersion: "ems-v1",
        rankingVersion: "baseline",
        tracks: [{ id: "track-a" }],
      },
      serving: {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
    });
    mocks.recordShadow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("renders the selected ranking and records its provenance after the response", async () => {
    render(await GmsPage());

    expect(screen.getByTestId("gms-dashboard")).toHaveTextContent("ems-v1:true:track-a");
    expect(mocks.prepare).toHaveBeenCalledWith("auth0|listener", 12);
    expect(mocks.select).toHaveBeenCalledWith(
      "auth0|listener",
      expect.objectContaining({ shadow: { rankingVersion: "hybrid-v0" } }),
    );
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
});
