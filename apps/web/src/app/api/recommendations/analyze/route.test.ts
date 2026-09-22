import { beforeEach, describe, expect, it, vi } from "vitest";

import { EmbeddingClientError } from "@/lib/embeddings/client";

const mocks = vi.hoisted(() => ({
  processBatch: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/embeddings/jobs", () => ({
  processEmbeddingBatch: mocks.processBatch,
}));

import { POST } from "./route";

describe("POST /api/recommendations/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.processBatch.mockResolvedValue({
      embeddedTrackCount: 16,
      failedTrackCount: 0,
      profileReady: false,
      remaining: 14,
    });
  });

  it("processes one batch for the authenticated user", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      embeddedTrackCount: 16,
      failedTrackCount: 0,
      profileReady: false,
      remaining: 14,
    });
    expect(mocks.processBatch).toHaveBeenCalledWith("auth0|listener");
  });

  it("rejects an anonymous request", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.processBatch).not.toHaveBeenCalled();
  });

  it("reports model unavailability as 503", async () => {
    mocks.processBatch.mockRejectedValue(
      new EmbeddingClientError("embedding_service_unavailable"),
    );

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "embedding_service_unavailable",
    });
  });

  it.each([
    "embedding_response_invalid",
    "embedding_model_mismatch",
  ] as const)("reports %s as 502", async (code) => {
    mocks.processBatch.mockRejectedValue(new EmbeddingClientError(code));

    const response = await POST();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ code });
  });
});
