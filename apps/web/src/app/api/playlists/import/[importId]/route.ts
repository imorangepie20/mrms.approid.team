import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getPlaylistImport } from "@/lib/playlists/import-playlists";

export async function GET(
  _request: Request,
  context: { params: Promise<{ importId: string }> },
) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const { importId } = await context.params;
  const playlistImport = await getPlaylistImport(auth0Subject, importId);
  if (!playlistImport) {
    return Response.json({ code: "playlist_import_not_found" }, { status: 404 });
  }
  return Response.json(playlistImport);
}
