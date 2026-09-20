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

export type SearchPlaylist = {
  artworkUrl: string;
  curator: string;
  id: string;
  title: string;
  trackCount: number;
};

export type SearchTopHit =
  | ({ kind: "track" } & PlayableTrack)
  | ({ kind: "album" } & SearchAlbum)
  | ({ kind: "playlist" } & SearchPlaylist);

export type TidalSearchResult = {
  albums: SearchAlbum[];
  next: string | null;
  playlists: SearchPlaylist[];
  topHits: SearchTopHit[];
  tracks: PlayableTrack[];
};

export const emptySearchResult: TidalSearchResult = {
  albums: [],
  next: null,
  playlists: [],
  topHits: [],
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

function resultReferences(document: Document, type: string) {
  const references = [
    ...relationshipReferences(document, type),
    ...relationshipReferences(document, "topHits").filter((reference) => reference.type === type),
  ];
  return [...new Map(references.map((reference) => [key(reference), reference])).values()];
}

function parseSearchDocument(document: Document): TidalSearchResult {
  const included = resources(document.included);
  const byKey = new Map(included.map((resource) => [key(resource), resource]));
  const artistName = (owner: Resource | undefined) =>
    related(owner, "artists")
      .map((reference) => text(byKey.get(key(reference)), "name"))
      .filter((name): name is string => Boolean(name))
      .join(", ") || "Unknown Artist";

  const albums = resultReferences(document, "albums").flatMap((reference) => {
    const album = byKey.get(key(reference));
    if (!album) return [];
    return [{
      artist: artistName(album),
      artworkUrl: artwork(album, byKey),
      id: String(reference.id),
      title: text(album, "title") ?? "Untitled album",
    }];
  });
  const playlists = resultReferences(document, "playlists").flatMap((reference) => {
    const playlist = byKey.get(key(reference));
    if (!playlist) return [];
    return [{
      artworkUrl: artwork(playlist, byKey),
      curator: "TIDAL",
      id: String(reference.id),
      title: text(playlist, "name") ?? "Untitled playlist",
      trackCount: typeof playlist.attributes?.numberOfTrackItems === "number"
        ? playlist.attributes.numberOfTrackItems
        : 0,
    }];
  });
  const tracks = resultReferences(document, "tracks").flatMap((reference) => {
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
  const albumsById = new Map(albums.map((album) => [album.id, album]));
  const playlistsById = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const topHits = relationshipReferences(document, "topHits").flatMap((reference): SearchTopHit[] => {
    const id = String(reference.id);
    if (reference.type === "tracks") {
      const track = tracksById.get(id);
      return track ? [{ ...track, kind: "track" }] : [];
    }
    if (reference.type === "albums") {
      const album = albumsById.get(id);
      return album ? [{ ...album, kind: "album" }] : [];
    }
    if (reference.type === "playlists") {
      const playlist = playlistsById.get(id);
      return playlist ? [{ ...playlist, kind: "playlist" }] : [];
    }
    return [];
  });

  return {
    albums,
    next: typeof document.links?.next === "string" && document.links.next
      ? document.links.next
      : null,
    playlists,
    topHits,
    tracks,
  };
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
    url.searchParams.set(
      "include",
      "topHits,tracks,albums,playlists,tracks.albums,tracks.artists,tracks.albums.coverArt,albums.artists,albums.coverArt,playlists.coverArt",
    );
  }

  const document = await tidalGet(url, credentials.accessToken, fetcher);
  return parseSearchDocument(document);
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
