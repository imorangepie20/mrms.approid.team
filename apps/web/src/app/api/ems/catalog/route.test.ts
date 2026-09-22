import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/ems/catalog", () => ({ listEmsTracks: mocks.list }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: () => ({ query: vi.fn() }) }));

import { GET } from "./route";

describe("GET /api/ems/catalog", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue({ tracks: [], nextCursor: null }); });

  it("clamps limit and returns catalog rows", async () => {
    const response = await GET(new Request("https://music-pie.test/api/ems/catalog?limit=999&region=KR&sort=title"));

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 100, region: "KR", sort: "title" }), expect.anything());
  });

  it("rejects unsupported region and sort without querying", async () => {
    const response = await GET(new Request("https://music-pie.test/api/ems/catalog?region=US&sort=sql"));

    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
