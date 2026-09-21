export const likeEntityTypes = ["track", "playlist", "album", "artist"] as const;
export type LikeEntityType = (typeof likeEntityTypes)[number];

export const likeSources = ["tidal", "catalog"] as const;
export type LikeSource = (typeof likeSources)[number];

export type LikeMetadataValue = boolean | number | string | null;
export type LikeMetadata = Record<string, LikeMetadataValue>;

export type LikeKey = {
  entityType: LikeEntityType;
  source: LikeSource;
  sourceId: string;
};

export type LikeSnapshot = {
  artworkUrl: string;
  metadata: LikeMetadata;
  subtitle: string;
  title: string;
};

export type LikeItem = LikeKey & LikeSnapshot & {
  createdAt: string;
};

export type LikesResponse = {
  albums: LikeItem[];
  artists: LikeItem[];
  counts: Record<LikeEntityType, number>;
  playlists: LikeItem[];
  tracks: LikeItem[];
};

const metadataKeys: Record<LikeEntityType, ReadonlySet<string>> = {
  album: new Set(["artist", "releaseDate"]),
  artist: new Set(),
  playlist: new Set(["trackCount"]),
  track: new Set(["album", "durationSeconds", "playbackAvailable"]),
};

function boundedText(value: unknown, maximum: number, required: boolean) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) return null;
  return normalized;
}

export function parseLikeKey(
  entityType: unknown,
  source: unknown,
  sourceId: unknown,
): LikeKey {
  if (!likeEntityTypes.includes(entityType as LikeEntityType)) {
    throw new Error("invalid_like_type");
  }
  if (!likeSources.includes(source as LikeSource)) {
    throw new Error("invalid_like_source");
  }
  const normalizedId = boundedText(sourceId, 300, true);
  if (!normalizedId) throw new Error("invalid_like_id");
  return {
    entityType: entityType as LikeEntityType,
    source: source as LikeSource,
    sourceId: normalizedId,
  };
}

export function parseLikeSnapshot(
  entityType: unknown,
  value: unknown,
): LikeSnapshot {
  if (!likeEntityTypes.includes(entityType as LikeEntityType)) {
    throw new Error("invalid_like_type");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_like_snapshot");
  }
  const input = value as Record<string, unknown>;
  const title = boundedText(input.title, 300, true);
  const subtitle = boundedText(input.subtitle ?? "", 300, false);
  if (!title || subtitle === null) throw new Error("invalid_like_snapshot");

  const artworkUrl = boundedText(input.artworkUrl ?? "", 2_000, false);
  if (artworkUrl === null) throw new Error("invalid_like_artwork");
  if (artworkUrl) {
    try {
      if (new URL(artworkUrl).protocol !== "https:") {
        throw new Error("invalid_like_artwork");
      }
    } catch {
      throw new Error("invalid_like_artwork");
    }
  }

  const metadataInput = input.metadata;
  if (!metadataInput || typeof metadataInput !== "object" || Array.isArray(metadataInput)) {
    throw new Error("invalid_like_snapshot");
  }
  const allowed = metadataKeys[entityType as LikeEntityType];
  const metadata = Object.fromEntries(
    Object.entries(metadataInput as Record<string, unknown>).filter(
      ([key, metadataValue]) =>
        allowed.has(key) &&
        (metadataValue === null ||
          typeof metadataValue === "boolean" ||
          typeof metadataValue === "number" && Number.isFinite(metadataValue) ||
          typeof metadataValue === "string" && metadataValue.length <= 300),
    ),
  ) as LikeMetadata;

  return { artworkUrl, metadata, subtitle, title };
}
