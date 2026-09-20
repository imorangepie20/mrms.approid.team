import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  requireAuth0Subject: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireAuth0Subject }));
vi.mock("@/lib/db/user-connections", () => ({ getUsableTidalAccessToken: mocks.getToken }));
vi.mock("@/lib/tidal/playback-stream", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tidal/playback-stream")>("@/lib/tidal/playback-stream");
  return { ...actual, resolveTidalPlaybackStream: mocks.resolve };
});

import { TidalPlaybackStreamError } from "@/lib/tidal/playback-stream";
import { GET } from "./route";

const context = { params: Promise.resolve({ trackId: "42" }) };

describe("GET /api/tidal/tracks/[trackId]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth0Subject.mockResolvedValue("auth0|a");
    mocks.getToken.mockResolvedValue({ accessToken: "access", scope: "r_stream" });
  });

  it("returns a no-store FULL stream", async () => {
    mocks.resolve.mockResolvedValue({
      assetPresentation: "FULL",
      audioQuality: "LOSSLESS",
      codec: "flac",
      durationSeconds: 240,
      manifestMimeType: "audio/flac",
      streamUrl: "https://audio.example/42.flac",
    });

    const response = await GET(new Request("http://localhost/api/tidal/tracks/42/stream"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ assetPresentation: "FULL" });
  });

  it.each([
    ["tidal_stream_scope_required", 409],
    ["tidal_full_playback_unavailable", 409],
    ["tidal_stream_format_unsupported", 415],
    ["tidal_playback_upstream_failed", 502],
  ] as const)("maps %s to %s", async (code, status) => {
    mocks.resolve.mockRejectedValue(new TidalPlaybackStreamError(code));
    const response = await GET(new Request("http://localhost/api/tidal/tracks/42/stream"), context);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ code });
  });
});
