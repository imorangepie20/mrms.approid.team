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
    reasonCodes: string[];
    score: number;
    scoreComponents: {
      catalogPriority: number;
      diversity: number;
      freshness: number;
      matchConfidence: number;
      similarity: number;
    };
  };
};

export type MusicState = {
  mmsTrackIds: string[];
  rejectedTrackIds: string[];
};
