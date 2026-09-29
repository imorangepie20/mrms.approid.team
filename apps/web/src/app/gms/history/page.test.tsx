import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  getHistory: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ auth0: { getSession: mocks.getSession } }));
vi.mock("@/lib/db/user-connections", () => ({ getUserConnection: mocks.getConnection }));
vi.mock("@/lib/db/gms-recommendation-batches", () => ({
  getPersonalizedRecommendationHistoryPage: mocks.getHistory,
}));
vi.mock("@/components/recommendations/recommendation-history-list", () => ({
  RecommendationHistoryList: ({ batches }: { batches: Array<{ batchId: string }> }) => (
    <div data-testid="history-list">{batches.map(({ batchId }) => batchId).join(",")}</div>
  ),
}));

import GmsRecommendationHistoryPage from "./page";

const originalDatabaseUrl = process.env.DATABASE_URL;

describe("GMS recommendation history page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://test";
    mocks.getSession.mockResolvedValue({ user: { sub: "auth0|listener" } });
    mocks.getConnection.mockResolvedValue({ status: "connected" });
    mocks.getHistory.mockResolvedValue({
      items: [{ batchId: "batch-a" }],
      page: 2,
      pageSize: 10,
      totalCount: 21,
      totalPages: 3,
    });
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("loads the authenticated user's requested page and renders pagination", async () => {
    render(await GmsRecommendationHistoryPage({ searchParams: Promise.resolve({ page: "2" }) }));

    expect(mocks.getHistory).toHaveBeenCalledWith("auth0|listener", 2, 10);
    expect(screen.getByTestId("history-list")).toHaveTextContent("batch-a");
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "총 21회"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute("href", "/gms/history?page=1");
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute("href", "/gms/history?page=3");
  });

  it("does not read personal history before authentication", async () => {
    mocks.getSession.mockResolvedValue(null);

    render(await GmsRecommendationHistoryPage({ searchParams: Promise.resolve({ page: "999" }) }));

    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.getHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "로그인하고 계속하기" })).toHaveAttribute(
      "href",
      "/api/auth/login?returnTo=/gms/history",
    );
  });

  it("normalizes an invalid page query", async () => {
    render(await GmsRecommendationHistoryPage({ searchParams: Promise.resolve({ page: "not-a-page" }) }));

    expect(mocks.getHistory).toHaveBeenCalledWith("auth0|listener", 1, 10);
  });
});
