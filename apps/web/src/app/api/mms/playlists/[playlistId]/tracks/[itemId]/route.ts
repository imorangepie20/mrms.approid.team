import { requireAuth0Subject } from "@/lib/auth/auth0";
import { deleteMmsPlaylistTrack } from "@/lib/db/mms-playlists";
import { mmsErrorResponse } from "@/lib/mms/http";

type TrackContext = { params: Promise<{ itemId: string; playlistId: string }> };

export async function DELETE(_request: Request, context: TrackContext) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const { itemId, playlistId } = await context.params;
  try {
    await deleteMmsPlaylistTrack(auth0Subject, playlistId, itemId);
    return Response.json({ deleted: true });
  } catch (error) {
    return mmsErrorResponse(error, "playlist_track_write_failed");
  }
}
