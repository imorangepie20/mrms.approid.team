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

export type ArtistGenreDocument = {
  genres: { count: number; name: string }[];
  tags: { count: number; name: string }[];
};

export async function lookupIsrc(
  isrc: string,
  fetcher: typeof fetch = fetch,
): Promise<{ recordings: unknown[] }> {
  const url = new URL(
    `/ws/2/isrc/${encodeURIComponent(isrc)}`,
    "https://musicbrainz.org",
  );
  url.searchParams.set("inc", "artist-credits+releases");
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

function extractCountedNames(
  entries: unknown,
): { count: number; name: string }[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (entry): entry is { count: number; name: string } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string" &&
        typeof (entry as { count?: unknown }).count === "number",
    )
    .map((entry) => ({
      count: entry.count,
      name: entry.name,
    }));
}

export async function lookupArtist(
  mbid: string,
  fetcher: typeof fetch = fetch,
): Promise<ArtistGenreDocument & { name: string }> {
  const url = new URL(
    `/ws/2/artist/${encodeURIComponent(mbid)}`,
    "https://musicbrainz.org",
  );
  url.searchParams.set("inc", "genres+tags");
  url.searchParams.set("fmt", "json");
  const response = await fetcher(url, {
    headers: { "user-agent": requireMusicBrainzUserAgent() },
  });
  if (response.status === 503 || response.status === 429) {
    throw new MusicBrainzError("retryable");
  }
  if (!response.ok) throw new MusicBrainzError("invalid_response");
  const body = (await response.json()) as {
    genres?: unknown;
    name?: unknown;
    tags?: unknown;
  };
  if (typeof body.name !== "string") {
    throw new MusicBrainzError("invalid_response");
  }
  return {
    genres: extractCountedNames(body.genres),
    name: body.name,
    tags: extractCountedNames(body.tags),
  };
}

