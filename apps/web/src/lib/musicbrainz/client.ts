export class MusicBrainzError extends Error {
  constructor(public readonly kind: "retryable" | "invalid_response") {
    super(kind);
  }
}

function requireMusicBrainzUserAgent() {
  const userAgent = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  if (!userAgent) throw new Error("MUSICBRAINZ_USER_AGENT is required.");
  return userAgent;
}

export async function lookupIsrc(
  isrc: string,
  fetcher: typeof fetch = fetch,
): Promise<{ recordings: unknown[] }> {
  const url = new URL(
    `/ws/2/isrc/${encodeURIComponent(isrc)}`,
    "https://musicbrainz.org",
  );
  url.searchParams.set("inc", "artist-credits+releases+release-groups");
  url.searchParams.set("fmt", "json");
  const response = await fetcher(url, {
    headers: { "user-agent": requireMusicBrainzUserAgent() },
  });
  if (response.status === 404) return { recordings: [] };
  if (response.status === 503 || response.status === 429) {
    throw new MusicBrainzError("retryable");
  }
  if (!response.ok) throw new MusicBrainzError("invalid_response");
  const body = (await response.json()) as { recordings?: unknown };
  if (!Array.isArray(body.recordings)) {
    throw new MusicBrainzError("invalid_response");
  }
  return { recordings: body.recordings };
}
