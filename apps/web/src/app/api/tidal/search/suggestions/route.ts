import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import { suggestTidalSearch } from "@/lib/tidal/search";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const length = Array.from(query).length;
  if (length > 200) {
    return Response.json({ code: "invalid_query" }, { status: 400 });
  }
  if (length < 2) return Response.json({ suggestions: [] });

  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const token = await getUsableTidalAccessToken(auth0Subject);
    const suggestions = await suggestTidalSearch(query, {
      accessToken: token.accessToken,
      apiBaseUrl: process.env.TIDAL_API_BASE_URL?.trim() || "https://openapi.tidal.com/v2",
      countryCode: process.env.TIDAL_COUNTRY_CODE?.trim() || "KR",
    });
    return Response.json({ suggestions });
  } catch (error) {
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
}
