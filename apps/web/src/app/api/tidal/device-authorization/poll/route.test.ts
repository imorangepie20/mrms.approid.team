import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poll: vi.fn(),
  readConfig: vi.fn(),
  requireAuth0Subject: vi.fn(),
  store: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireAuth0Subject }));
vi.mock("@/lib/tidal/oauth", () => ({ readTidalOAuthConfig: mocks.readConfig }));
vi.mock("@/lib/tidal/device-authorization", () => ({ pollTidalDeviceAuthorization: mocks.poll }));
vi.mock("@/lib/db/user-connections", () => ({ storeTidalDeviceToken: mocks.store }));

import { POST } from "./route";

const request = () => new Request("http://localhost/api/tidal/device-authorization/poll", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ deviceCode: "device-1" }),
});

describe("POST /api/tidal/device-authorization/poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth0Subject.mockResolvedValue("auth0|a");
    mocks.readConfig.mockReturnValue({ clientId: "client" });
  });

  it("returns pending without storing a token", async () => {
    mocks.poll.mockResolvedValue({ status: "authorization_pending" });
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("stores a connected token", async () => {
    const token = { accessToken: "access", expiresIn: 3600, refreshToken: "refresh", scope: "r_stream", userId: "1" };
    mocks.poll.mockResolvedValue({ status: "connected", token });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.store).toHaveBeenCalledWith("auth0|a", token);
  });
});
