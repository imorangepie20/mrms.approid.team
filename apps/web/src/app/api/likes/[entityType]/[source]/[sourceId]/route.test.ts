import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUserLike: vi.fn(),
  requireSubject: vi.fn(),
  upsertUserLike: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/user-likes", () => ({
  deleteUserLike: mocks.deleteUserLike,
  upsertUserLike: mocks.upsertUserLike,
}));

import { DELETE, PUT } from "./route";

const params = Promise.resolve({ entityType: "track", source: "tidal", sourceId: "42" });
const snapshot = {
  artworkUrl: "",
  metadata: { album: "Homogenic" },
  subtitle: "Björk",
  title: "Jóga",
};

describe("/api/likes/[entityType]/[source]/[sourceId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.upsertUserLike.mockResolvedValue({
      ...snapshot,
      createdAt: "2026-09-21T00:00:00.000Z",
      entityType: "track",
      source: "tidal",
      sourceId: "42",
    });
    mocks.deleteUserLike.mockResolvedValue(false);
  });

  it("upserts a validated snapshot", async () => {
    const response = await PUT(new Request("http://localhost/api/likes", {
      body: JSON.stringify(snapshot),
      method: "PUT",
    }), { params });

    expect(response.status).toBe(200);
    expect(mocks.upsertUserLike).toHaveBeenCalledWith(
      "auth0|listener-a",
      expect.objectContaining({ entityType: "track", source: "tidal", sourceId: "42" }),
    );
    await expect(response.json()).resolves.toMatchObject({ liked: true });
  });

  it("rejects an unsupported source before authentication or database access", async () => {
    const response = await PUT(new Request("http://localhost/api/likes", {
      body: JSON.stringify(snapshot),
      method: "PUT",
    }), { params: Promise.resolve({ entityType: "track", source: "spotify", sourceId: "42" }) });

    expect(response.status).toBe(400);
    expect(mocks.requireSubject).not.toHaveBeenCalled();
    expect(mocks.upsertUserLike).not.toHaveBeenCalled();
  });

  it("rejects malformed snapshots", async () => {
    const response = await PUT(new Request("http://localhost/api/likes", {
      body: JSON.stringify({ ...snapshot, title: "" }),
      method: "PUT",
    }), { params });

    expect(response.status).toBe(400);
    expect(mocks.upsertUserLike).not.toHaveBeenCalled();
  });

  it("rejects oversized snapshots before authentication or database access", async () => {
    const response = await PUT(new Request("http://localhost/api/likes", {
      body: JSON.stringify({ ...snapshot, padding: "x".repeat(20_000) }),
      method: "PUT",
    }), { params });

    expect(response.status).toBe(413);
    expect(mocks.requireSubject).not.toHaveBeenCalled();
    expect(mocks.upsertUserLike).not.toHaveBeenCalled();
  });

  it("treats deleting an absent item as success", async () => {
    const response = await DELETE(new Request("http://localhost/api/likes", {
      method: "DELETE",
    }), { params });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ liked: false });
  });

  it("returns 401 without a session", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await DELETE(new Request("http://localhost/api/likes", {
      method: "DELETE",
    }), { params });

    expect(response.status).toBe(401);
    expect(mocks.deleteUserLike).not.toHaveBeenCalled();
  });
});
