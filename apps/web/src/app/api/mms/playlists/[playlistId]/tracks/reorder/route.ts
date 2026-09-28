import { requireAuth0Subject } from "@/lib/auth/auth0";
import { reorderMmsPlaylistTracks } from "@/lib/db/mms-playlists";
import { mmsErrorResponse, readMmsJson } from "@/lib/mms/http";
import { parseMmsPlaylistReorder } from "@/lib/mms/playlists";

type ReorderContext = { params: Promise<{ playlistId: string }> };

export async function PATCH(request: Request, context: ReorderContext) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const { playlistId } = await context.params;
  try {
    const itemIds = parseMmsPlaylistReorder(await readMmsJson(request));
    await reorderMmsPlaylistTracks(auth0Subject, playlistId, itemIds);
    return Response.json({ reordered: true });
  } catch (error) {
    return mmsErrorResponse(error, "playlist_track_write_failed");
  }
}
