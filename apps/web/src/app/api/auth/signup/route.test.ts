import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/auth/signup", () => {
  it("redirects only to the internal login route with the sign-up hint", () => {
    const response = GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/api/auth/login?screen_hint=signup");
  });
});
