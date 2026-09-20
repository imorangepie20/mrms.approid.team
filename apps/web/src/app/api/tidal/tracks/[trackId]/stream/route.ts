import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import {
  resolveTidalPlaybackStream,
  TidalPlaybackStreamError,
} from "@/lib/tidal/playback-stream";

type Context = { params: Promise<{ trackId: string }> };

const errorStatus = {
  tidal_full_playback_unavailable: 409,
  tidal_playback_upstream_failed: 502,
  tidal_stream_format_unsupported: 415,
  tidal_stream_scope_required: 409,
} as const;

export async function GET(request: Request, context: Context) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  try {
    const [{ trackId }, token] = await Promise.all([
      context.params,
      getUsableTidalAccessToken(auth0Subject),
    ]);
    const quality = new URL(request.url).searchParams.get("quality") ?? undefined;
    const stream = await resolveTidalPlaybackStream(trackId, token, { quality });
    return Response.json(stream, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TidalPlaybackStreamError) {
      return Response.json({ code: error.code }, { status: errorStatus[error.code] });
    }
    return Response.json({ code: "tidal_device_authorization_required" }, { status: 409 });
  }
}
