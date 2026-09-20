import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  requireSubject: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/user-connections", () => ({ getUsableTidalAccessToken: mocks.getToken }));
vi.mock("@/lib/tidal/search", () => ({ searchTidalCatalog: mocks.search }));

import { GET } from "./route";

describe("GET /api/tidal/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TIDAL_API_BASE_URL = "https://openapi.tidal.com/v2";
    process.env.TIDAL_COUNTRY_CODE = "KR";
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.getToken.mockResolvedValue({ accessToken: "secret" });
    mocks.search.mockResolvedValue({ albums: [], artists: [], next: null, tracks: [] });
  });

  it("passes a bounded query and same-origin cursor to the adapter", async () => {
    const cursor = "https://openapi.tidal.com/v2/searchResults?page[cursor]=next";
    const response = await GET(new Request(
      `http://localhost/api/tidal/search?q=Bj%C3%B6rk&cursor=${encodeURIComponent(cursor)}`,
    ));

    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(
      "Björk",
      expect.objectContaining({ accessToken: "secret", countryCode: "KR" }),
      undefined,
      cursor,
    );
  });

  it.each([
    ["overlong query", "q", "🎵".repeat(201)],
    ["foreign cursor", "cursor", "https://attacker.example/cursor"],
  ])("rejects %s before requesting TIDAL", async (_label, key, value) => {
    const url = new URL("http://localhost/api/tidal/search");
    url.searchParams.set("q", "music");
    url.searchParams.set(key, value);

    const response = await GET(new Request(url));

    expect(response.status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
