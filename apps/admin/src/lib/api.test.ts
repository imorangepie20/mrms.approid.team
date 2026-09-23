import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApiError, getEmsSummary, getEmsTracks } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("admin API client", () => {
  it("requests summary from the same origin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ activeTrackCount: 12 })));

    await expect(getEmsSummary()).resolves.toEqual({ activeTrackCount: 12 });
    expect(fetch).toHaveBeenCalledWith("/api/admin/ems/summary", expect.objectContaining({ headers: { accept: "application/json" } }));
  });

  it("preserves the server error code for UI state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "admin_forbidden" }), { status: 403 })));

    await expect(getEmsTracks({ query: "track" })).rejects.toEqual(new AdminApiError(403, "admin_forbidden"));
  });
});
