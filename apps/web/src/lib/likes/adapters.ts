import type { LikeKey, LikeSnapshot } from "./types";
import type { Track } from "@/lib/music/types";

export function trackLikeItem(track: Track): LikeKey & LikeSnapshot {
  const source = track.tidalTrackId ? "tidal" as const : "catalog" as const;
  return {
    artworkUrl: track.artworkUrl,
    entityType: "track",
    metadata: {
      album: track.album,
      durationSeconds: track.durationSeconds ?? null,
      playbackAvailable: track.playbackAvailable ?? true,
    },
    source,
    sourceId: track.tidalTrackId ?? track.id,
    subtitle: track.artist,
    title: track.title,
  };
}
