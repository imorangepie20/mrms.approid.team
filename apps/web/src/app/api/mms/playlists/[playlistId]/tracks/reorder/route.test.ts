import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reorder: vi.fn(), requireSubject: vi.fn() }));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/mms-playlists", () => ({ reorderMmsPlaylistTracks: mocks.reorder }));

import { PATCH } from "./route";

const playlistId = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ playlistId }) };

describe("playlist track reorder route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.reorder.mockResolvedValue(true);
  });

  it("stores a complete validated order", async () => {
    const response = await PATCH(new Request("http://localhost", {
      body: JSON.stringify({ itemIds: [second, first] }),
      method: "PATCH",
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.reorder).toHaveBeenCalledWith("auth0|listener-a", playlistId, [second, first]);
  });

  it("rejects duplicate item ids before database access", async () => {
    const response = await PATCH(new Request("http://localhost", {
      body: JSON.stringify({ itemIds: [first, first] }),
      method: "PATCH",
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.reorder).not.toHaveBeenCalled();
  });
});
