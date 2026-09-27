import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolve: vi.fn(),
  token: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.auth }));
vi.mock("@/lib/db/user-connections", () => ({ getUsableTidalAccessToken: mocks.token }));
vi.mock("@/lib/tidal/playback-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tidal/playback-stream")>();
  return { ...actual, resolveTidalPlaybackStream: mocks.resolve };
});

import { GET, MAX_ANALYSIS_AUDIO_BYTES } from "./route";

describe("TIDAL analysis audio route", () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue("auth0|member");
    mocks.token.mockReset().mockResolvedValue({ accessToken: "test-token", scope: "r_usr+w_usr" });
    mocks.resolve.mockReset().mockResolvedValue({
      assetPresentation: "FULL",
      audioQuality: "HIGH",
      codec: "aac",
      durationSeconds: 180,
      manifestMimeType: "audio/mp4",
      streamUrl: "https://audio.example/signed.mp4",
    });
    vi.unstubAllGlobals();
  });

  it("requires an authenticated user before resolving a stream", async () => {
    mocks.auth.mockRejectedValue(new Error("unauthorized"));
    const response = await GET(
      new Request("https://music.example/api/tidal/tracks/42/analysis"),
      { params: Promise.resolve({ trackId: "42" }) },
    );
    expect(response.status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("proxies bounded audio without exposing its signed URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "3", "content-type": "audio/mp4" },
    })));
    const response = await GET(
      new Request("https://music.example/api/tidal/tracks/42/analysis?quality=HIGH"),
      { params: Promise.resolve({ trackId: "42" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(body)).not.toContain("signed.mp4");
  });

  it("rejects a declared response larger than the hard cap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), {
      headers: { "content-length": String(MAX_ANALYSIS_AUDIO_BYTES + 1) },
    })));
    const response = await GET(
      new Request("https://music.example/api/tidal/tracks/42/analysis"),
      { params: Promise.resolve({ trackId: "42" }) },
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: "tidal_analysis_audio_too_large" });
  });
});
