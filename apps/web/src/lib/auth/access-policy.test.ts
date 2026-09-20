import { describe, expect, it } from "vitest";

import { canUsePersonalization } from "./access-policy";

describe("canUsePersonalization", () => {
  it.each([
    "not_connected",
    "authorization_pending",
    "reauthentication_required",
    "disconnected",
  ] as const)("does not allow personalization while status is %s", (status) => {
    expect(
      canUsePersonalization({
        connectionStatus: status,
        isAuthenticated: true,
      }),
    ).toBe(false);
  });

  it("does not allow an anonymous user with a stale connected value", () => {
    expect(
      canUsePersonalization({
        connectionStatus: "connected",
        isAuthenticated: false,
      }),
    ).toBe(false);
  });

  it("allows personalization only for an authenticated connected user", () => {
    expect(
      canUsePersonalization({
        connectionStatus: "connected",
        isAuthenticated: true,
      }),
    ).toBe(true);
  });
});
