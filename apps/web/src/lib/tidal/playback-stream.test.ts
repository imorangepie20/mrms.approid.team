import { describe, expect, it, vi } from "vitest";

import {
  resolveTidalPlaybackStream,
  TidalPlaybackStreamError,
} from "./playback-stream";

const token = {
  accessToken: "access",
  expiresAt: new Date("2026-09-22T00:00:00.000Z"),
  scope: "r_usr w_usr w_sub",
  userId: "123",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function manifest(input: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(input)).toString("base64");
}

describe("TIDAL playback stream resolver", () => {
  it("requests the highest quality by default and decodes a FULL direct stream", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      assetPresentation: "FULL",
      audioQuality: "LOSSLESS",
      manifest: manifest({
        assetPresentation: "FULL",
        codecs: "flac",
        encryptionType: "NONE",
        mimeType: "audio/flac",
        urls: ["https://audio.example/42.flac"],
      }),
    }));

    const result = await resolveTidalPlaybackStream("42", token, { fetcher });

    expect(result).toMatchObject({
      assetPresentation: "FULL",
      codec: "flac",
      streamUrl: "https://audio.example/42.flac",
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/tracks/42/playbackinfo?audioquality=HI_RES_LOSSLESS&playbackmode=STREAM&assetpresentation=FULL"),
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer access" }) }),
    );
  });

  it("falls back to the highest playable quality when TIDAL returns DASH", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({
        assetPresentation: "FULL",
        manifestMimeType: "application/dash+xml",
        manifest: Buffer.from("<?xml version=\"1.0\"?><MPD />").toString("base64"),
      }))
      .mockResolvedValueOnce(response({
        assetPresentation: "FULL",
        manifestMimeType: "application/dash+xml",
        manifest: Buffer.from("<?xml version=\"1.0\"?><MPD />").toString("base64"),
      }))
      .mockResolvedValueOnce(response({
        assetPresentation: "FULL",
        audioQuality: "HIGH",
        manifest: manifest({
          codecs: "aac",
          encryptionType: "NONE",
          mimeType: "audio/mp4",
          urls: ["https://audio.example/42.mp4"],
        }),
      }));

    const result = await resolveTidalPlaybackStream("42", token, { fetcher });

    expect(result.streamUrl).toBe("https://audio.example/42.mp4");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("audioquality=HI_RES_LOSSLESS"),
      expect.stringContaining("audioquality=HI_RES"),
      expect.stringContaining("audioquality=LOSSLESS"),
    ]);
  });

  it("accepts the legacy session scopes used by the working Android client", async () => {
    const payload = Buffer.from(JSON.stringify({ scope: "r_usr w_usr w_sub", cc: "KR" })).toString("base64url");
    const fetcher = vi.fn().mockResolvedValue(response({
      assetPresentation: "FULL",
      manifest: "https://audio.example/42.flac",
    }));

    await resolveTidalPlaybackStream("42", { ...token, accessToken: `x.${payload}.y`, scope: null }, { fetcher });

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("countryCode=KR"), expect.any(Object));
  });

  it("rejects a token without streaming scope", async () => {
    await expect(resolveTidalPlaybackStream("42", { ...token, scope: "playback" }))
      .rejects.toEqual(new TidalPlaybackStreamError("tidal_stream_scope_required"));
  });

  it("rejects PREVIEW responses", async () => {
    const fetcher = vi.fn().mockImplementation(() => response({
      assetPresentation: "PREVIEW",
      manifest: "https://audio.example/preview.flac",
    }));
    await expect(resolveTidalPlaybackStream("42", token, { fetcher }))
      .rejects.toEqual(new TidalPlaybackStreamError("tidal_full_playback_unavailable"));
  });

  it.each([
    [{ encryptionType: "AES", mimeType: "application/vnd.apple.mpegurl", urls: ["https://audio.example/a.m3u8"] }, "DRM"],
    [{ encryptionType: "NONE", mimeType: "application/dash+xml", urls: ["https://audio.example/a.mpd"] }, "DASH"],
  ])("rejects unsupported %s manifests", async (payload) => {
    const fetcher = vi.fn().mockImplementation(() => response({
      assetPresentation: "FULL",
      manifest: manifest({ assetPresentation: "FULL", ...payload }),
    }));
    await expect(resolveTidalPlaybackStream("42", token, { fetcher }))
      .rejects.toEqual(new TidalPlaybackStreamError("tidal_stream_format_unsupported"));
  });
});
