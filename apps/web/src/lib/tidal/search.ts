import type { PlayableTrack } from "@/lib/tidal/player";
import {
  TidalApiError,
  tidalGet,
  type TidalApiCredentials,
} from "@/lib/tidal/api";

export type SearchAlbum = {
  artist: string;
  artworkUrl: string;
  id: string;
  title: string;
};

export type SearchArtist = {
  id: string;
  name: string;
};

export type TidalSearchResult = {
  albums: SearchAlbum[];
  artists: SearchArtist[];
  next: string | null;
  tracks: PlayableTrack[];
};

export const emptySearchResult: TidalSearchResult = {
  albums: [],
  artists: [],
  next: null,
  tracks: [],
};

type Identifier = { id?: unknown; type?: unknown };
type Resource = Identifier & {
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: Identifier | Identifier[] | null }>;
};
type Document = {
  data?: unknown;
  included?: unknown;
  links?: { next?: unknown };
};

function resources(value: unknown): Resource[] {
  if (Array.isArray(value)) return value as Resource[];
  return typeof value === "object" && value !== null ? [value as Resource] : [];
}

async function tidalGetResource(
  url: URL,
  token: string,
  fetcher: typeof fetch,
): Promise<Document> {
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
  const document = (await response.json()) as Document;
  if (
    typeof document.data !== "object" ||
    document.data === null ||
    Array.isArray(document.data)
  ) {
    throw new TidalApiError("invalid_response");
  }
  return document;
}

function key(identifier: Identifier) {
  return `${String(identifier.type)}:${String(identifier.id)}`;
}

function related(resource: Resource | undefined, relationship: string) {
  const data = resource?.relationships?.[relationship]?.data;
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function text(resource: Resource | undefined, attribute: string) {
  const value = resource?.attributes?.[attribute];
  return typeof value === "string" ? value : null;
}

function durationSeconds(duration: string | null) {
  if (!duration) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function artwork(
  owner: Resource | undefined,
  byKey: Map<string, Resource>,
) {
  const reference = related(owner, "coverArt")[0];
  const files = reference
    ? byKey.get(key(reference))?.attributes?.files
    : undefined;
  if (!Array.isArray(files)) return "";
  return files
    .filter((file): file is { href: string; meta?: { height?: number; width?: number } } =>
      typeof file === "object" &&
      file !== null &&
      typeof (file as { href?: unknown }).href === "string",
    )
    .sort((left, right) =>
      (right.meta?.height ?? 0) * (right.meta?.width ?? 0) -
      (left.meta?.height ?? 0) * (left.meta?.width ?? 0),
    )[0]?.href ?? "";
}

function relationshipReferences(document: Document, name: string) {
  const references = resources(document.data).flatMap((item) => related(item, name));
  if (references.length > 0) return references;
  return resources(document.included).filter((item) => item.type === name);
}

function parseSearchDocument(document: Document): TidalSearchResult {
  const included = resources(document.included);
  const byKey = new Map(included.map((resource) => [key(resource), resource]));
  const artistName = (owner: Resource | undefined) =>
    related(owner, "artists")
      .map((reference) => text(byKey.get(key(reference)), "name"))
      .filter((name): name is string => Boolean(name))
      .join(", ") || "Unknown Artist";

  const artists = relationshipReferences(document, "artists").flatMap((reference) => {
    const artist = byKey.get(key(reference));
    if (!artist) return [];
    return [{ id: String(reference.id), name: text(artist, "name") ?? "Unknown Artist" }];
  });
  const albums = relationshipReferences(document, "albums").flatMap((reference) => {
    const album = byKey.get(key(reference));
    if (!album) return [];
    return [{
      artist: artistName(album),
      artworkUrl: artwork(album, byKey),
      id: String(reference.id),
      title: text(album, "title") ?? "Untitled album",
    }];
  });
  const tracks = relationshipReferences(document, "tracks").flatMap((reference) => {
    const track = byKey.get(key(reference));
    if (!track) return [];
    const albumReference = related(track, "albums")[0];
    const album = albumReference ? byKey.get(key(albumReference)) : undefined;
    const tidalTrackId = String(reference.id);
    return [{
      album: text(album, "title") ?? "Unknown Album",
      artist: artistName(track),
      artworkClass: "from-violet-500 to-sky-500",
      artworkUrl: artwork(album, byKey),
      durationSeconds: durationSeconds(text(track, "duration")),
      id: tidalTrackId,
      tidalTrackId,
      title: text(track, "title") ?? "Untitled track",
    }];
  });

  return {
    albums,
    artists,
    next: typeof document.links?.next === "string" && document.links.next
      ? document.links.next
      : null,
    tracks,
  };
}

async function completeTrackRelationships(
  document: Document,
  credentials: TidalApiCredentials,
  fetcher: typeof fetch,
) {
  const byKey = new Map(
    resources(document.included).map((resource) => [key(resource), resource]),
  );
  const trackReferences = relationshipReferences(document, "tracks");
  const missingIds = [...new Set(trackReferences.flatMap((reference) => {
    const track = byKey.get(key(reference));
    const albumReference = related(track, "albums")[0];
    const album = albumReference ? byKey.get(key(albumReference)) : undefined;
    const hasArtists = related(track, "artists").some((artist) => byKey.has(key(artist)));
    const complete = track && album && hasArtists && artwork(album, byKey);
    return complete ? [] : [String(reference.id)];
  }))];
  if (missingIds.length === 0) return document;

  const base = `${credentials.apiBaseUrl.replace(/\/$/, "")}/`;
  const detailDocuments = await Promise.all(missingIds.map(async (id) => {
    const url = new URL(`tracks/${encodeURIComponent(id)}`, base);
    url.searchParams.set("countryCode", credentials.countryCode);
    url.searchParams.set("include", "albums,artists,albums.coverArt");
    return tidalGetResource(url, credentials.accessToken, fetcher);
  }));
  for (const detail of detailDocuments) {
    for (const resource of [
      ...resources(detail.data),
      ...resources(detail.included),
    ]) {
      byKey.set(key(resource), resource);
    }
  }
  return { ...document, included: [...byKey.values()] };
}

export async function searchTidalCatalog(
  query: string,
  credentials: TidalApiCredentials,
  fetcher: typeof fetch = fetch,
  pageUrl?: string,
) {
  const normalized = query.trim();
  if (!normalized && !pageUrl) return emptySearchResult;

  const base = `${credentials.apiBaseUrl.replace(/\/$/, "")}/`;
  const url = pageUrl ? new URL(pageUrl) : new URL("searchResults", base);
  if (url.origin !== new URL(credentials.apiBaseUrl).origin) {
    throw new TidalApiError("invalid_response");
  }
  if (!pageUrl) {
    url.searchParams.set("filter[query]", normalized);
    url.searchParams.set("countryCode", credentials.countryCode);
    url.searchParams.set("deviceType", "BROWSER");
    url.searchParams.set("systemType", "WEB");
    url.searchParams.set("include", "tracks,albums,artists");
  }

  const document = await tidalGet(url, credentials.accessToken, fetcher);
  const completeDocument = await completeTrackRelationships(
    document,
    credentials,
    fetcher,
  );
  return parseSearchDocument(completeDocument);
}

export async function suggestTidalSearch(
  query: string,
  credentials: TidalApiCredentials,
  fetcher: typeof fetch = fetch,
) {
  const normalized = query.trim();
  if (!normalized) return [];
  const url = new URL(
    "searchSuggestions",
    `${credentials.apiBaseUrl.replace(/\/$/, "")}/`,
  );
  url.searchParams.set("filter[query]", normalized);
  url.searchParams.set("countryCode", credentials.countryCode);
  url.searchParams.set("include", "directHits");
  const document = await tidalGet(url, credentials.accessToken, fetcher);
  const typedDocument = document as Document;
  const included = resources(typedDocument.included);
  const byKey = new Map(included.map((resource) => [key(resource), resource]));
  const hits = relationshipReferences(typedDocument, "directHits");
  return hits.flatMap((reference) => {
    const hit = byKey.get(key(reference));
    const value = text(hit, "query") ?? text(hit, "value") ?? text(hit, "name");
    return value ? [value] : [];
  });
}
