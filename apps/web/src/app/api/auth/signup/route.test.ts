import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/auth/signup", () => {
  it("redirects only to the internal login route with the sign-up hint", () => {
    const response = GET(new Request("https://mrms.approid.team/api/auth/signup"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://mrms.approid.team/api/auth/login?screen_hint=signup",
    );
  });
});
