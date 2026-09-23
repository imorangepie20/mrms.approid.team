import { describe, expect, it } from "vitest";

import { adminErrorResponse } from "./admin-response";

describe("adminErrorResponse", () => {
  it("maps admin auth errors to their status and code", async () => {
    const response = adminErrorResponse({ status: 403, code: "admin_forbidden" });
    await expect(response.json()).resolves.toEqual({ code: "admin_forbidden" });
    expect(response.status).toBe(403);
  });

  it("hides unexpected error details behind a service unavailable response", async () => {
    const response = adminErrorResponse(new Error("database password"));
    await expect(response.json()).resolves.toEqual({ code: "admin_ems_unavailable" });
    expect(response.status).toBe(503);
  });
});
