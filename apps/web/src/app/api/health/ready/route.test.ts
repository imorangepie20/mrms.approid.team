import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkDatabaseReadiness } = vi.hoisted(() => ({
  checkDatabaseReadiness: vi.fn(),
}));

vi.mock("@/lib/health/readiness", () => ({ checkDatabaseReadiness }));

import { GET } from "./route";

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    checkDatabaseReadiness.mockReset();
  });

  it("returns ready when PostgreSQL responds", async () => {
    checkDatabaseReadiness.mockResolvedValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns an opaque unavailable response when PostgreSQL fails", async () => {
    checkDatabaseReadiness.mockResolvedValue(false);

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain("secret host");
    expect(body).not.toContain("stack");
  });
});
