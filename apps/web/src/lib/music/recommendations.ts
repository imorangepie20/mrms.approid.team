import type { MusicState, Preference, Track } from "./types";

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
