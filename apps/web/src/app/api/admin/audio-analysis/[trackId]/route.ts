import { adminErrorResponse } from "@/lib/api/admin-response";
import {
  AUDIO_ANALYSIS_FEATURE_VERSION,
  getAudioAnalysisTrackDetail,
  requeueAudioAnalysisTrack,
} from "@/lib/audio-analysis/admin";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";

type Context = { params: Promise<{ trackId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function trackIdFrom(context: Context) {
  const { trackId } = await context.params;
  return UUID_PATTERN.test(trackId) ? trackId : null;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdminAuth0Subject();
    const trackId = await trackIdFrom(context);
    if (!trackId) return Response.json({ code: "invalid_audio_analysis_track_id" }, { status: 400 });
    return Response.json(await getAudioAnalysisTrackDetail(trackId, getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    const appOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
    if (origin && origin !== appOrigin) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    const trackId = await trackIdFrom(context);
    if (!trackId) return Response.json({ code: "invalid_audio_analysis_track_id" }, { status: 400 });
    const body: unknown = await request.json();
    if (
      !body || typeof body !== "object"
      || Object.keys(body).length !== 1
      || !("featureVersion" in body)
      || body.featureVersion !== AUDIO_ANALYSIS_FEATURE_VERSION
    ) {
      return Response.json({ code: "invalid_audio_analysis_requeue" }, { status: 400 });
    }
    return Response.json(await requeueAudioAnalysisTrack(trackId, AUDIO_ANALYSIS_FEATURE_VERSION, getDatabasePool()), { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_audio_analysis_requeue" }, { status: 400 });
    return adminErrorResponse(error);
  }
}
