import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/auth/signup", () => {
  it("redirects to sign-up with the connected onboarding return path", () => {
    const response = GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "/api/auth/login?screen_hint=signup&returnTo=%2Fonboarding%3Ftidal%3Dconnected",
    );
  });
});
