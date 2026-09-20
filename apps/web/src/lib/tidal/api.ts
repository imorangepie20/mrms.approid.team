import type { PositionedTrack } from "@/lib/music/library-types";

export type TidalApiCredentials = {
  accessToken: string;
  apiBaseUrl: string;
  countryCode: string;
};

export type TidalPlaylistSummary = {
  artworkUrl: string | null;
  description: string | null;
  id: string;
  name: string;
  saved: boolean;
  trackCount: number;
};

export class TidalApiError extends Error {
  constructor(
    public readonly kind:
      | "reauthenticate"
      | "retryable"
      | "invalid_response",
  ) {
    super(kind);
  }
}

type JsonApiIdentifier = {
  id?: unknown;
  meta?: Record<string, unknown>;
  type?: unknown;
};

type JsonApiResource = JsonApiIdentifier & {
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: JsonApiIdentifier | JsonApiIdentifier[] | null }>;
};

type JsonApiDocument = {
  data?: unknown;
  included?: unknown;
  links?: { next?: unknown };
};

function asResourceArray(value: unknown): JsonApiResource[] {
  return Array.isArray(value) ? (value as JsonApiResource[]) : [];
}

function resourceKey(resource: JsonApiIdentifier) {
  return `${String(resource.type)}:${String(resource.id)}`;
}

function includedResources(document: JsonApiDocument) {
  return new Map(
    asResourceArray(document.included).map((resource) => [
      resourceKey(resource),
      resource,
    ]),
  );
}

function relationshipData(
  resource: JsonApiResource,
  name: string,
): JsonApiIdentifier[] {
  const data = resource.relationships?.[name]?.data;
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function stringAttribute(resource: JsonApiResource | undefined, name: string) {
  const value = resource?.attributes?.[name];
  return typeof value === "string" ? value : null;
}

function artworkUrl(
  owner: JsonApiResource | undefined,
  resources: Map<string, JsonApiResource>,
) {
  const artworkReference = relationshipData(owner ?? {}, "coverArt")[0];
  const artwork = artworkReference
    ? resources.get(resourceKey(artworkReference))
    : undefined;
  const files = artwork?.attributes?.files;
  if (!Array.isArray(files)) return null;

  const candidates = files.filter(
    (file): file is { href: string; meta?: { height?: number; width?: number } } =>
      typeof file === "object" &&
      file !== null &&
      typeof (file as { href?: unknown }).href === "string",
  );
  candidates.sort((left, right) => {
    const leftArea = (left.meta?.width ?? 0) * (left.meta?.height ?? 0);
    const rightArea = (right.meta?.width ?? 0) * (right.meta?.height ?? 0);
    return rightArea - leftArea;
  });
  return candidates[0]?.href ?? null;
}

function durationMilliseconds(value: string | null) {
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

function nextLink(document: JsonApiDocument) {
  const next = document.links?.next;
  return typeof next === "string" && next.length > 0 ? next : null;
}

export async function tidalGet(
  url: URL,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<JsonApiDocument> {
  const response = await fetcher(url, {
    headers: {
      accept: "application/vnd.api+json",
      authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new TidalApiError("reauthenticate");
  }
  if (response.status === 429 || response.status >= 500) {
    throw new TidalApiError("retryable");
  }
  if (!response.ok) throw new TidalApiError("invalid_response");

  const document = (await response.json()) as JsonApiDocument;
  if (!Array.isArray(document.data)) {
    throw new TidalApiError("invalid_response");
  }
  return document;
}

export async function listUserPlaylists(
  credentials: TidalApiCredentials,
  fetcher: typeof fetch = fetch,
  pageUrl?: string,
) {
  const url = pageUrl
    ? new URL(pageUrl)
    : new URL("playlists", `${credentials.apiBaseUrl.replace(/\/$/, "")}/`);
  if (url.origin !== new URL(credentials.apiBaseUrl).origin) {
    throw new TidalApiError("invalid_response");
  }
  if (!pageUrl) {
    url.searchParams.set("filter[owners.id]", "me");
    url.searchParams.set("countryCode", credentials.countryCode);
    url.searchParams.set("include", "coverArt");
  }
  const document = await tidalGet(url, credentials.accessToken, fetcher);
  const resources = includedResources(document);
  const items = asResourceArray(document.data).map((playlist) => ({
    artworkUrl: artworkUrl(playlist, resources),
    description: stringAttribute(playlist, "description"),
    id: String(playlist.id),
    name: stringAttribute(playlist, "name") ?? "Untitled playlist",
    saved: false,
    trackCount:
      typeof playlist.attributes?.numberOfTrackItems === "number"
        ? playlist.attributes.numberOfTrackItems
        : 0,
  } satisfies TidalPlaylistSummary));
  return { items, next: nextLink(document) };
}

export function parsePlaylistItems(
  document: JsonApiDocument,
  startPosition = 0,
): { next: string | null; tracks: PositionedTrack[] } {
  const resources = includedResources(document);
  const tracks = asResourceArray(document.data).flatMap((identifier, index) => {
    if (identifier.type !== "tracks") return [];
    const track = resources.get(resourceKey(identifier));
    if (!track) throw new TidalApiError("invalid_response");
    const albumReference = relationshipData(track, "albums")[0];
    const album = albumReference
      ? resources.get(resourceKey(albumReference))
      : undefined;
    const artists = relationshipData(track, "artists")
      .map((reference) => resources.get(resourceKey(reference)))
      .map((artist) => stringAttribute(artist, "name"))
      .filter((name): name is string => Boolean(name));
    const addedAtValue = identifier.meta?.addedAt;
    const addedAt =
      typeof addedAtValue === "string" && !Number.isNaN(Date.parse(addedAtValue))
        ? new Date(addedAtValue)
        : null;

    return [{
      addedAt,
      position: startPosition + index,
      track: {
        albumName: stringAttribute(album, "title") ?? "Unknown Album",
        artistName: artists.join(", ") || "Unknown Artist",
        durationMs: durationMilliseconds(stringAttribute(track, "duration")),
        isrc: stringAttribute(track, "isrc"),
        tidalAlbumId: albumReference ? String(albumReference.id) : null,
        tidalArtworkUrl: artworkUrl(album, resources),
        tidalTrackId: String(track.id),
        title: stringAttribute(track, "title") ?? "Untitled track",
      },
    }];
  });
  return { next: nextLink(document), tracks };
}

export async function* getPlaylistTrackPages(
  playlistId: string,
  credentials: TidalApiCredentials,
  fetcher: typeof fetch = fetch,
) {
  const apiOrigin = new URL(credentials.apiBaseUrl).origin;
  let url: URL | null = new URL(
    `playlists/${encodeURIComponent(playlistId)}/relationships/items`,
    `${credentials.apiBaseUrl.replace(/\/$/, "")}/`,
  );
  url.searchParams.set("countryCode", credentials.countryCode);
  url.searchParams.set("include", "items");
  let position = 0;

  while (url) {
    if (url.origin !== apiOrigin) throw new TidalApiError("invalid_response");
    const document = await tidalGet(url, credentials.accessToken, fetcher);
    const page = parsePlaylistItems(document, position);
    yield page;
    position += asResourceArray(document.data).length;
    url = page.next ? new URL(page.next) : null;
  }
}
