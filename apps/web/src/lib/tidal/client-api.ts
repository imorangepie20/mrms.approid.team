import type { TidalPlaylistSummary } from "./api";

export type PlaylistImportStatus = {
  enrichmentPendingCount: number;
  errorCode: string | null;
  savedPlaylistCount: number;
  savedTrackCount: number;
  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "failed_retryable"
    | "failed";
};

async function responseJson<T>(response: Response, errorCode: string) {
  if (!response.ok) throw new Error(errorCode);
  return (await response.json()) as T;
}

export async function fetchTidalPlaylists(signal?: AbortSignal) {
  const response = await fetch("/api/tidal/playlists", { signal });
  const body = await responseJson<{ playlists: TidalPlaylistSummary[] }>(
    response,
    "tidal_playlist_load_failed",
  );
  return body.playlists;
}

export async function startPlaylistImport(
  playlistIds: string[],
  signal?: AbortSignal,
) {
  const response = await fetch("/api/playlists/import", {
    body: JSON.stringify({ playlistIds }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal,
  });
  return responseJson<{ importId: string }>(
    response,
    "playlist_import_start_failed",
  );
}

export async function fetchPlaylistImportStatus(
  importId: string,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/playlists/import/${encodeURIComponent(importId)}`,
    { signal },
  );
  return responseJson<PlaylistImportStatus>(
    response,
    "playlist_import_status_failed",
  );
}

export async function enrichNextTrack(signal?: AbortSignal) {
  const response = await fetch("/api/musicbrainz/enrich", {
    method: "POST",
    signal,
  });
  return responseJson<{ processed: boolean; remaining: number }>(
    response,
    "musicbrainz_enrichment_failed",
  );
}
