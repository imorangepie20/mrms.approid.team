import { describe, expect, it, vi } from "vitest";

vi.mock("@auth0/nextjs-auth0/server", () => ({
  Auth0Client: class {
    getSession = vi.fn();
  },
}));

import { requireAuth0Subject } from "./auth0";

describe("requireAuth0Subject", () => {
  it("returns the authenticated Auth0 subject", async () => {
    await expect(
      requireAuth0Subject(async () => ({ user: { sub: "auth0|listener" } })),
    ).resolves.toBe("auth0|listener");
  });

  it("rejects an anonymous request", async () => {
    await expect(requireAuth0Subject(async () => null)).rejects.toThrow(
      "Authentication required.",
    );
  });
});
