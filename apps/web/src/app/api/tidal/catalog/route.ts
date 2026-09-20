import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import { getCatalogTrackPages } from "@/lib/tidal/api";
import type { PlayableTrack } from "@/lib/tidal/player";

function credentials(accessToken: string) {
  return {
    accessToken,
    apiBaseUrl: process.env.TIDAL_API_BASE_URL?.trim() || "https://openapi.tidal.com/v2",
    countryCode: process.env.TIDAL_COUNTRY_CODE?.trim() || "KR",
  };
}

function errorResponse(error: unknown) {
  const kind = typeof error === "object" && error !== null && "kind" in error
    ? error.kind
    : null;
  if (kind === "reauthenticate") {
    return Response.json({ code: "tidal_reauthentication_required" }, { status: 401 });
  }
  if (kind === "retryable") {
    return Response.json({ code: "tidal_retryable" }, { status: 503 });
  }
  return Response.json({ code: "tidal_catalog_failed" }, { status: 409 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id")?.trim() ?? "";
  if ((type !== "album" && type !== "playlist") || !id || id.length > 300) {
    return Response.json({ code: "invalid_catalog_item" }, { status: 400 });
  }

  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const token = await getUsableTidalAccessToken(auth0Subject);
    const tracks: PlayableTrack[] = [];
    for await (const page of getCatalogTrackPages(
      type,
      id,
      credentials(token.accessToken),
    )) {
      tracks.push(...page.tracks.map(({ track }) => ({
        album: track.albumName,
        artist: track.artistName,
        artworkClass: "from-violet-500 to-sky-500",
        artworkUrl: track.tidalArtworkUrl ?? "",
        durationSeconds:
          track.durationMs === null ? null : Math.round(track.durationMs / 1000),
        id: track.tidalTrackId,
        tidalTrackId: track.tidalTrackId,
        title: track.title,
      })));
    }
    return Response.json({ tracks });
  } catch (error) {
    return errorResponse(error);
  }
}
