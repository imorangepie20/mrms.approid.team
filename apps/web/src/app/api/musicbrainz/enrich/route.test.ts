import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrich: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/musicbrainz/enrichment", () => ({ enrichNextTrack: mocks.enrich }));

import { POST } from "./route";

describe("POST /api/musicbrainz/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.enrich.mockResolvedValue({ processed: true, remaining: 3 });
  });

  it("processes at most one job for the authenticated user", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: true, remaining: 3 });
    expect(mocks.enrich).toHaveBeenCalledWith("auth0|listener");
  });

  it("rejects an anonymous enrichment request", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.enrich).not.toHaveBeenCalled();
  });

  it("does not misreport an enrichment failure as an authentication failure", async () => {
    mocks.enrich.mockRejectedValue(new Error("database unavailable"));

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ code: "enrichment_failed" });
  });
});
