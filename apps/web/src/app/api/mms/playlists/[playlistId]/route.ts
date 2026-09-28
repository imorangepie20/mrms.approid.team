import { requireAuth0Subject } from "@/lib/auth/auth0";
import {
  deleteMmsPlaylist,
  getMmsPlaylist,
  updateMmsPlaylist,
} from "@/lib/db/mms-playlists";
import { mmsErrorResponse, readMmsJson } from "@/lib/mms/http";
import { parseMmsPlaylistPatch } from "@/lib/mms/playlists";

type PlaylistContext = { params: Promise<{ playlistId: string }> };

async function subject() {
  try {
    return await requireAuth0Subject();
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: PlaylistContext) {
  const auth0Subject = await subject();
  if (!auth0Subject) return Response.json({ code: "unauthorized" }, { status: 401 });
  const { playlistId } = await context.params;
  try {
    const playlist = await getMmsPlaylist(auth0Subject, playlistId);
    if (!playlist) return Response.json({ code: "playlist_not_found" }, { status: 404 });
    return Response.json({ playlist });
  } catch {
    return Response.json({ code: "playlist_read_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: PlaylistContext) {
  const auth0Subject = await subject();
  if (!auth0Subject) return Response.json({ code: "unauthorized" }, { status: 401 });
  const { playlistId } = await context.params;
  try {
    const patch = parseMmsPlaylistPatch(await readMmsJson(request));
    const playlist = await updateMmsPlaylist(auth0Subject, playlistId, patch);
    if (!playlist) return Response.json({ code: "playlist_not_found" }, { status: 404 });
    return Response.json({ playlist });
  } catch (error) {
    return mmsErrorResponse(error, "playlist_write_failed");
  }
}

export async function DELETE(_request: Request, context: PlaylistContext) {
  const auth0Subject = await subject();
  if (!auth0Subject) return Response.json({ code: "unauthorized" }, { status: 401 });
  const { playlistId } = await context.params;
  try {
    const deleted = await deleteMmsPlaylist(auth0Subject, playlistId);
    if (!deleted) return Response.json({ code: "playlist_not_found" }, { status: 404 });
    return Response.json({ deleted: true });
  } catch {
    return Response.json({ code: "playlist_write_failed" }, { status: 500 });
  }
}
