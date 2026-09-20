export type Preference = "accept" | "reject";

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkClass: string;
};

export type MusicState = {
  mmsTrackIds: string[];
  rejectedTrackIds: string[];
};
