import { describe, expect, it } from "vitest";

import { hasAuth0Configuration } from "./auth0-config";

describe("hasAuth0Configuration", () => {
  it("requires every server-only Auth0 value before enabling authentication", () => {
    expect(
      hasAuth0Configuration({
        AUTH0_SECRET: "secret",
        AUTH0_DOMAIN: "music-pie.us.auth0.com",
        AUTH0_CLIENT_ID: "client-id",
        AUTH0_CLIENT_SECRET: "client-secret",
        APP_BASE_URL: "https://mrms.approid.team",
      }),
    ).toBe(true);

    expect(
      hasAuth0Configuration({
        AUTH0_SECRET: "secret",
        AUTH0_DOMAIN: "music-pie.us.auth0.com",
        AUTH0_CLIENT_ID: "client-id",
        AUTH0_CLIENT_SECRET: "",
        APP_BASE_URL: "https://mrms.approid.team",
      }),
    ).toBe(false);
  });
});
