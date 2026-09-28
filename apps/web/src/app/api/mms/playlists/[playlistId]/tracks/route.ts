import { requireAuth0Subject } from "@/lib/auth/auth0";
import { addMmsPlaylistTrack } from "@/lib/db/mms-playlists";
import { mmsErrorResponse, readMmsJson } from "@/lib/mms/http";
import { parseMmsPlaylistTrack } from "@/lib/mms/playlists";

type TracksContext = { params: Promise<{ playlistId: string }> };

export async function POST(request: Request, context: TracksContext) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const { playlistId } = await context.params;
  try {
    const input = parseMmsPlaylistTrack(await readMmsJson(request));
    const item = await addMmsPlaylistTrack(auth0Subject, playlistId, input);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return mmsErrorResponse(error, "playlist_track_write_failed");
  }
}
