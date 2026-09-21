import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health/live", () => {
  it("returns only the liveness status", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
