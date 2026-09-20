export type TidalPlaylistSnapshot = {
  description: string | null;
  name: string;
  tidalArtworkUrl: string | null;
  tidalPlaylistId: string;
};

export type TidalTrackSnapshot = {
  albumName: string;
  artistName: string;
  durationMs: number | null;
  isrc: string | null;
  tidalAlbumId: string | null;
  tidalArtworkUrl: string | null;
  tidalTrackId: string;
  title: string;
};

export type PositionedTrack = {
  addedAt: Date | null;
  position: number;
  track: TidalTrackSnapshot;
};

export type PlaylistImportStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed_retryable"
  | "failed";

export type MusicBrainzStatus =
  | "pending"
  | "matched"
  | "not_found"
  | "ambiguous"
  | "failed"
  | "unavailable";
