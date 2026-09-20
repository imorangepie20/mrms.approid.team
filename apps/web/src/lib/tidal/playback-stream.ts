import type { UsableTidalAccessToken } from "@/lib/db/user-connections";

export type TidalPlaybackStream = {
  assetPresentation: "FULL";
  audioQuality: string | null;
  codec: string | null;
  durationSeconds: number | null;
  manifestMimeType: string | null;
  streamUrl: string;
};

export type TidalPlaybackStreamCode =
  | "tidal_stream_scope_required"
  | "tidal_full_playback_unavailable"
  | "tidal_stream_format_unsupported"
  | "tidal_playback_upstream_failed";

export class TidalPlaybackStreamError extends Error {
  constructor(public readonly code: TidalPlaybackStreamCode) {
    super(code);
    this.name = "TidalPlaybackStreamError";
  }
}

type ResolveOptions = {
  apiBaseUrl?: string;
  countryCode?: string;
  fetcher?: typeof fetch;
  quality?: string;
};

type Manifest = {
  assetPresentation?: unknown;
  codecs?: unknown;
  duration?: unknown;
  encryptionType?: unknown;
  mimeType?: unknown;
  url?: unknown;
  urls?: unknown;
};

function jwtClaims(accessToken: string) {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return {} as Record<string, unknown>;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function scopes(token: UsableTidalAccessToken) {
  const claimScope = jwtClaims(token.accessToken).scope;
  return `${token.scope ?? ""} ${typeof claimScope === "string" ? claimScope : ""}`
    .split(/[\s,]+/)
    .filter(Boolean);
}

function decodeManifest(value: unknown): Manifest & { directUrl?: string } {
  if (typeof value !== "string" || !value.trim()) {
    throw new TidalPlaybackStreamError("tidal_playback_upstream_failed");
  }
  if (/^https:\/\//i.test(value)) return { directUrl: value };
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Manifest;
  } catch {
    throw new TidalPlaybackStreamError("tidal_playback_upstream_failed");
  }
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function streamUrl(manifest: Manifest & { directUrl?: string }) {
  const firstUrl = Array.isArray(manifest.urls) ? manifest.urls.find((url) => typeof url === "string") : null;
  const value = manifest.directUrl ?? string(manifest.url) ?? string(firstUrl);
  if (!value || !/^https:\/\//i.test(value)) {
    throw new TidalPlaybackStreamError("tidal_playback_upstream_failed");
  }
  return value;
}

export async function resolveTidalPlaybackStream(
  trackId: string,
  token: UsableTidalAccessToken,
  options: ResolveOptions = {},
): Promise<TidalPlaybackStream> {
  if (!/^\d+$/.test(trackId)) throw new TidalPlaybackStreamError("tidal_playback_upstream_failed");
  if (!scopes(token).includes("r_stream")) {
    throw new TidalPlaybackStreamError("tidal_stream_scope_required");
  }
  const quality = (options.quality ?? "LOSSLESS").toUpperCase();
  if (!new Set(["LOW", "HIGH", "LOSSLESS", "HI_RES", "HI_RES_LOSSLESS"]).has(quality)) {
    throw new TidalPlaybackStreamError("tidal_playback_upstream_failed");
  }
  const claims = jwtClaims(token.accessToken);
  const countryCode = string(claims.cc) ?? options.countryCode ?? process.env.TIDAL_COUNTRY_CODE ?? "US";
  const baseUrl = (options.apiBaseUrl ?? process.env.TIDAL_PLAYBACK_API_BASE_URL ?? "https://api.tidal.com/v1").replace(/\/$/, "");
  const url = new URL(`${baseUrl}/tracks/${trackId}/playbackinfo`);
  url.search = new URLSearchParams({
    audioquality: quality,
    playbackmode: "STREAM",
    assetpresentation: "FULL",
    countryCode: countryCode.toUpperCase(),
  }).toString();
  const response = await (options.fetcher ?? fetch)(url.toString(), {
    headers: { accept: "application/json", authorization: `Bearer ${token.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new TidalPlaybackStreamError("tidal_playback_upstream_failed");
  const body = (await response.json()) as Record<string, unknown>;
  const manifest = decodeManifest(body.manifest);
  const presentation = string(body.assetPresentation) ?? string(manifest.assetPresentation);
  if (presentation !== "FULL") {
    throw new TidalPlaybackStreamError("tidal_full_playback_unavailable");
  }
  const mimeType = string(manifest.mimeType);
  const encryptionType = string(manifest.encryptionType);
  const urlValue = streamUrl(manifest);
  if (
    (encryptionType && encryptionType.toUpperCase() !== "NONE") ||
    mimeType?.toLowerCase().includes("dash") ||
    /\.mpd(?:\?|$)/i.test(urlValue)
  ) {
    throw new TidalPlaybackStreamError("tidal_stream_format_unsupported");
  }
  const duration = typeof manifest.duration === "number" ? manifest.duration : null;
  return {
    assetPresentation: "FULL",
    audioQuality: string(body.audioQuality),
    codec: string(manifest.codecs),
    durationSeconds: duration,
    manifestMimeType: mimeType,
    streamUrl: urlValue,
  };
}
