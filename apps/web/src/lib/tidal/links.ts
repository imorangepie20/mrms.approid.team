export type TidalResourceKind = "track" | "album" | "playlist";

const pluralResource = {
  album: "albums",
  playlist: "playlists",
  track: "tracks",
} as const;

export function tidalEmbedUrl(kind: TidalResourceKind, id: string) {
  return `https://embed.tidal.com/${pluralResource[kind]}/${encodeURIComponent(id)}`;
}

export function tidalBrowseUrl(kind: TidalResourceKind, id: string) {
  return `https://tidal.com/browse/${kind}/${encodeURIComponent(id)}`;
}
