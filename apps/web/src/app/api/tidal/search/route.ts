import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import { searchTidalCatalog } from "@/lib/tidal/search";

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
  return Response.json({ code: "tidal_not_connected" }, { status: 409 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const cursor = url.searchParams.get("cursor") || undefined;
  const apiBaseUrl = process.env.TIDAL_API_BASE_URL?.trim() || "https://openapi.tidal.com/v2";
  if (Array.from(query).length > 200) {
    return Response.json({ code: "invalid_query" }, { status: 400 });
  }
  if (cursor) {
    try {
      if (new URL(cursor).origin !== new URL(apiBaseUrl).origin) throw new Error();
    } catch {
      return Response.json({ code: "invalid_cursor" }, { status: 400 });
    }
  }

  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const token = await getUsableTidalAccessToken(auth0Subject);
    const results = await searchTidalCatalog(
      query,
      credentials(token.accessToken),
      undefined,
      cursor,
    );
    return Response.json(results);
  } catch (error) {
    return errorResponse(error);
  }
}
