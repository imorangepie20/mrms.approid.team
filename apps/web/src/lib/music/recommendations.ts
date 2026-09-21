import type { MusicState, Preference, Track } from "./types";

const FALLBACK_TAG_COUNT = 3;
const FIELD_SEPARATOR = " | ";

export function getGatewayTracks(
  catalog: Track[],
  mmsTrackIds: string[],
  rejectedTrackIds: string[],
): Track[] {
  return catalog.filter(
    (track) =>
      !mmsTrackIds.includes(track.id) && !rejectedTrackIds.includes(track.id),
  );
}

function describeTrack(track: Track): string {
  return [track.title, track.artist, track.album]
    .map((value) => value?.trim())
    .filter((value) => value && value.length > 0)
    .join(FIELD_SEPARATOR);
}

function pickGenreInput(track: Track, vocabulary: string[]): string[] {
  const genres = track.genres?.filter((genre) => genre.trim().length > 0);
  if (genres && genres.length > 0) return genres;

  const known = new Set(vocabulary);
  return (track.tags ?? [])
    .filter((tag) => tag.trim().length > 0)
    .filter((tag) => known.has(tag))
    .slice(0, FALLBACK_TAG_COUNT);
}

export function buildEmbeddingText(track: Track, vocabulary: string[]): string {
  const genreInput = pickGenreInput(track, vocabulary);
  const metadata = describeTrack(track);
  if (genreInput.length === 0) return metadata;

  return [metadata, genreInput.join(", ")].join(FIELD_SEPARATOR);
}

export function applyPreference(
  state: MusicState,
  trackId: string,
  preference: Preference,
): MusicState {
  if (preference === "accept") {
    return {
      ...state,
      mmsTrackIds: addUnique(state.mmsTrackIds, trackId),
    };
  }

  return {
    mmsTrackIds: state.mmsTrackIds.filter((id) => id !== trackId),
    rejectedTrackIds: addUnique(state.rejectedTrackIds, trackId),
  };
}

function addUnique(ids: string[], trackId: string): string[] {
  return ids.includes(trackId) ? ids : [...ids, trackId];
}
