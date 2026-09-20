import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import { listUserPlaylists } from "@/lib/tidal/api";

export async function GET() {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const token = await getUsableTidalAccessToken(auth0Subject);
    const page = await listUserPlaylists({
      accessToken: token.accessToken,
      apiBaseUrl:
        process.env.TIDAL_API_BASE_URL?.trim() ||
        "https://openapi.tidal.com/v2",
      countryCode: process.env.TIDAL_COUNTRY_CODE?.trim() || "KR",
    });
    return Response.json({ playlists: page.items, next: page.next });
  } catch (error) {
    const kind =
      typeof error === "object" && error !== null && "kind" in error
        ? error.kind
        : null;
    if (kind === "reauthenticate") {
      return Response.json(
        { code: "tidal_reauthentication_required" },
        { status: 401 },
      );
    }
    if (kind === "retryable") {
      return Response.json({ code: "tidal_retryable" }, { status: 503 });
    }
    return Response.json({ code: "tidal_not_connected" }, { status: 409 });
  }
}
