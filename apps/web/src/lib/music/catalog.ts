import type { Track } from "./types";

export function filterCatalogTracks(tracks: Track[], { query = "" }: { query?: string }): Track[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return tracks;
  }

  return tracks.filter((track) =>
    [track.title, track.artist, track.album].some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
}
