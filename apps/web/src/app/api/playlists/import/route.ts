import { requireAuth0Subject } from "@/lib/auth/auth0";
import { ImportError, startPlaylistImport } from "@/lib/playlists/import-playlists";

export async function POST(request: Request) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }
  const playlistIds =
    typeof body === "object" && body !== null && "playlistIds" in body
      ? body.playlistIds
      : null;
  if (
    !Array.isArray(playlistIds) ||
    !playlistIds.every((id) => typeof id === "string")
  ) {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await startPlaylistImport({ auth0Subject, playlistIds });
    return Response.json({ importId: result.importId }, { status: 202 });
  } catch (error) {
    const code = error instanceof ImportError ? error.code : "playlist_import_failed";
    const status =
      code === "playlist_selection_required" || code === "playlist_not_owned"
        ? 400
        : code === "tidal_reauthentication_required"
          ? 401
          : 503;
    return Response.json({ code }, { status });
  }
}
