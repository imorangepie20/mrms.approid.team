import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  requireSubject: vi.fn(),
  suggest: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/user-connections", () => ({ getUsableTidalAccessToken: mocks.getToken }));
vi.mock("@/lib/tidal/search", () => ({ suggestTidalSearch: mocks.suggest }));

import { GET } from "./route";

describe("GET /api/tidal/search/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.getToken.mockResolvedValue({ accessToken: "secret" });
    mocks.suggest.mockResolvedValue(["Björk"]);
  });

  it("returns no suggestions below two Unicode code points", async () => {
    const response = await GET(
      new Request("http://localhost/api/tidal/search/suggestions?q=%F0%9F%8E%B5"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [] });
    expect(mocks.getToken).not.toHaveBeenCalled();
  });

  it("returns normalized direct-hit suggestions", async () => {
    const response = await GET(
      new Request("http://localhost/api/tidal/search/suggestions?q=bj"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: ["Björk"] });
    expect(mocks.suggest).toHaveBeenCalledWith(
      "bj",
      expect.objectContaining({ accessToken: "secret" }),
    );
  });
});
