import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readConfig: vi.fn(),
  requireAuth0Subject: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireAuth0Subject }));
vi.mock("@/lib/tidal/oauth", () => ({ readTidalOAuthConfig: mocks.readConfig }));
vi.mock("@/lib/tidal/device-authorization", () => ({
  startTidalDeviceAuthorization: mocks.start,
}));

import { POST } from "./route";

describe("POST /api/tidal/device-authorization/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth0Subject.mockResolvedValue("auth0|a");
    mocks.readConfig.mockReturnValue({ clientId: "client" });
  });

  it("starts device authorization for an authenticated user", async () => {
    mocks.start.mockResolvedValue({
      deviceCode: "device-1",
      userCode: "ABCD",
      verificationUri: "https://link.tidal.com",
      verificationUriComplete: null,
      expiresAt: new Date("2026-09-21T01:00:00.000Z"),
      intervalSeconds: 5,
    });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ userCode: "ABCD" });
  });

  it("rejects anonymous users", async () => {
    mocks.requireAuth0Subject.mockRejectedValue(new Error("unauthorized"));
    expect((await POST()).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
