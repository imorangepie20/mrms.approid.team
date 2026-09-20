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
};

export type MusicState = {
  mmsTrackIds: string[];
  rejectedTrackIds: string[];
};
