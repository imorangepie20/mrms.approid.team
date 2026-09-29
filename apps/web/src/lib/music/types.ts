export type Preference = "accept" | "reject";

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "stalled"
  | "error";

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkClass: string;
  artworkUrl: string;
  durationSeconds?: number | null;
  genres?: string[];
  playbackAvailable?: boolean;
  tags?: string[];
  tidalTrackId?: string;
  recommendation?: {
    rankingVersion: "baseline" | "hybrid-v0";
    reasonCodes: string[];
    score: number;
    scoreComponents: {
      audio?: number;
      baseScore?: number;
      catalogPriority: number;
      diversity: number;
      freshness: number;
      hybridSimilarity?: number;
      matchConfidence: number;
      mood?: number;
      rhythm?: number;
      selectorScore?: number;
      similarity: number;
      text?: number;
    };
  };
};

export type MusicState = {
  mmsTrackIds: string[];
  rejectedTrackIds: string[];
};
