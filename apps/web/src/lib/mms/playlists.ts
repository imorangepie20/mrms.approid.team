import type { LikeSource } from "@/lib/likes/types";
import type { Track } from "@/lib/music/types";

export type MmsPlaylistSummary = {
  containsTrack?: boolean;
  createdAt: string;
  description: string | null;
  id: string;
  name: string;
  trackCount: number;
  updatedAt: string;
};

export function parseMmsPlaylistTrackKey(value: unknown) {
  const key = boundedText(value, 308, true);
  if (!key || (!key.startsWith("tidal:") && !key.startsWith("catalog:"))) {
    throw new Error("invalid_playlist_track_key");
  }
  return key;
}

export type MmsPlaylistTrack = {
  createdAt: string;
  id: string;
  position: number;
  source: LikeSource;
  sourceId: string;
  track: Track;
  trackKey: string;
};

export type MmsPlaylistDetail = MmsPlaylistSummary & {
  tracks: MmsPlaylistTrack[];
};

export type MmsPlaylistMetadata = {
  description: string | null;
  name: string;
};

export type MmsPlaylistPatch = Partial<MmsPlaylistMetadata>;

export type MmsPlaylistTrackInput = {
  album: string;
  artist: string;
  artworkUrl: string;
  durationSeconds: number | null;
  playbackAvailable: boolean;
  source: LikeSource;
  sourceId: string;
  tidalTrackId: string | null;
  title: string;
};

export type ParsedMmsPlaylistTrack = MmsPlaylistTrackInput & {
  trackKey: string;
};

function objectInput(value: unknown, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, maximum: number, required: boolean) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) return null;
  return normalized;
}

function parseDescription(value: unknown) {
  if (value === undefined || value === null) return null;
  const description = boundedText(value, 500, false);
  if (description === null) throw new Error("invalid_playlist_description");
  return description || null;
}

export function parseMmsPlaylistCreate(value: unknown): MmsPlaylistMetadata {
  const input = objectInput(value, "invalid_playlist_input");
  const name = boundedText(input.name, 100, true);
  if (!name) throw new Error("invalid_playlist_name");
  return { description: parseDescription(input.description), name };
}

export function parseMmsPlaylistPatch(value: unknown): MmsPlaylistPatch {
  const input = objectInput(value, "invalid_playlist_patch");
  const patch: MmsPlaylistPatch = {};
  if (Object.hasOwn(input, "name")) {
    const name = boundedText(input.name, 100, true);
    if (!name) throw new Error("invalid_playlist_name");
    patch.name = name;
  }
  if (Object.hasOwn(input, "description")) {
    patch.description = parseDescription(input.description);
  }
  if (!Object.keys(patch).length) throw new Error("invalid_playlist_patch");
  return patch;
}

function parseArtworkUrl(value: unknown) {
  const artworkUrl = boundedText(value ?? "", 2_000, false);
  if (artworkUrl === null) throw new Error("invalid_playlist_track_artwork");
  if (!artworkUrl) return "";
  try {
    if (new URL(artworkUrl).protocol !== "https:") throw new Error();
  } catch {
    throw new Error("invalid_playlist_track_artwork");
  }
  return artworkUrl;
}

export function parseMmsPlaylistTrack(value: unknown): ParsedMmsPlaylistTrack {
  const input = objectInput(value, "invalid_playlist_track");
  if (input.source !== "tidal" && input.source !== "catalog") {
    throw new Error("invalid_playlist_track_source");
  }
  const source = input.source;
  const sourceId = boundedText(input.sourceId, 300, true);
  const title = boundedText(input.title, 300, true);
  const artist = boundedText(input.artist, 300, true);
  const album = boundedText(input.album, 300, true);
  if (!sourceId || !title || !artist || !album) throw new Error("invalid_playlist_track");

  const durationValue = input.durationSeconds;
  const durationSeconds = durationValue === undefined || durationValue === null
    ? null
    : durationValue;
  if (
    durationSeconds !== null &&
    (typeof durationSeconds !== "number" ||
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 0 ||
      durationSeconds > 86_400)
  ) {
    throw new Error("invalid_playlist_track_duration");
  }
  if (input.playbackAvailable !== undefined && typeof input.playbackAvailable !== "boolean") {
    throw new Error("invalid_playlist_track_playback");
  }

  const declaredTidalId = input.tidalTrackId === undefined || input.tidalTrackId === null
    ? null
    : boundedText(input.tidalTrackId, 300, true);
  if (input.tidalTrackId !== undefined && input.tidalTrackId !== null && !declaredTidalId) {
    throw new Error("invalid_playlist_track_id");
  }
  if (source === "tidal" && declaredTidalId !== null && declaredTidalId !== sourceId) {
    throw new Error("invalid_playlist_track_id");
  }
  if (source === "catalog" && declaredTidalId !== null) {
    throw new Error("invalid_playlist_track_id");
  }

  return {
    album,
    artist,
    artworkUrl: parseArtworkUrl(input.artworkUrl),
    durationSeconds,
    playbackAvailable: input.playbackAvailable ?? true,
    source,
    sourceId,
    tidalTrackId: source === "tidal" ? sourceId : null,
    title,
    trackKey: `${source}:${sourceId}`,
  };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMmsPlaylistReorder(value: unknown) {
  const input = objectInput(value, "invalid_playlist_track_order");
  if (!Array.isArray(input.itemIds) || input.itemIds.length === 0 || input.itemIds.length > 10_000) {
    throw new Error("invalid_playlist_track_order");
  }
  const itemIds = input.itemIds;
  if (
    itemIds.some((item) => typeof item !== "string" || !uuidPattern.test(item)) ||
    new Set(itemIds).size !== itemIds.length
  ) {
    throw new Error("invalid_playlist_track_order");
  }
  return itemIds as string[];
}

export function playlistTrackInput(track: Track): MmsPlaylistTrackInput {
  const source = track.tidalTrackId ? "tidal" : "catalog";
  const sourceId = track.tidalTrackId ?? track.id;
  return {
    album: track.album,
    artist: track.artist,
    artworkUrl: track.artworkUrl,
    durationSeconds: track.durationSeconds ?? null,
    playbackAvailable: track.playbackAvailable ?? true,
    source,
    sourceId,
    tidalTrackId: track.tidalTrackId ?? null,
    title: track.title,
  };
}
