import { requireAuth0Subject } from "@/lib/auth/auth0";
import {
  createMmsPlaylist,
  getMmsPlaylists,
  getMmsPlaylistsForTrack,
} from "@/lib/db/mms-playlists";
import { mmsErrorResponse, readMmsJson } from "@/lib/mms/http";
import { parseMmsPlaylistCreate, parseMmsPlaylistTrackKey } from "@/lib/mms/playlists";

async function subject() {
  try {
    return await requireAuth0Subject();
  } catch {
    return null;
  }
}

export async function GET(request?: Request) {
  const auth0Subject = await subject();
  if (!auth0Subject) return Response.json({ code: "unauthorized" }, { status: 401 });
  try {
    const requestedKey = request ? new URL(request.url).searchParams.get("trackKey") : null;
    const playlists = requestedKey
      ? await getMmsPlaylistsForTrack(auth0Subject, parseMmsPlaylistTrackKey(requestedKey))
      : await getMmsPlaylists(auth0Subject);
    return Response.json({ playlists });
  } catch (error) {
    return mmsErrorResponse(error, "playlist_read_failed");
  }
}

export async function POST(request: Request) {
  const auth0Subject = await subject();
  if (!auth0Subject) return Response.json({ code: "unauthorized" }, { status: 401 });
  try {
    const input = parseMmsPlaylistCreate(await readMmsJson(request));
    const playlist = await createMmsPlaylist(auth0Subject, input);
    return Response.json({ playlist }, { status: 201 });
  } catch (error) {
    return mmsErrorResponse(error, "playlist_write_failed");
  }
}
