import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/lib/ems/sections", () => ({ listEmsSections: mocks.list }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: () => ({ query: vi.fn() }) }));

import { GET } from "./route";

describe("GET /api/ems/sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ totalCount: 54, sections: [] });
  });

  it("returns bounded editorial sections", async () => {
    const response = await GET(
      new Request(
        "https://music-pie.test/api/ems/sections?region=KR&limit=12&sectionLimit=3",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(
      { limit: 12, region: "KR", sectionLimit: 3 },
      expect.anything(),
    );
  });

  it.each([
    "?region=US",
    "?limit=0",
    "?limit=13",
    "?sectionLimit=0",
    "?sectionLimit=6",
  ])("rejects invalid filters: %s", async (query) => {
    const response = await GET(
      new Request(`https://music-pie.test/api/ems/sections${query}`),
    );

    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
