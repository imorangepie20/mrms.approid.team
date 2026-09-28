import { adminErrorResponse } from "@/lib/api/admin-response";
import {
  AUDIO_ANALYSIS_STATUSES,
  getAudioAnalysisAdminData,
  type AudioAnalysisStatus,
} from "@/lib/audio-analysis/admin";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";

export async function GET(request: Request) {
  try {
    await requireAdminAuth0Subject();
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() ?? "";
    const status = params.get("status") || undefined;
    const page = Number(params.get("page") ?? 1);
    const limit = Number(params.get("limit") ?? 20);
    if (
      query.length > 120
      || !Number.isInteger(page) || page < 1 || page > 100_000
      || !Number.isInteger(limit) || limit < 1 || limit > 50
      || (status && !AUDIO_ANALYSIS_STATUSES.includes(status as AudioAnalysisStatus))
    ) {
      return Response.json({ code: "invalid_audio_analysis_filter" }, { status: 400 });
    }
    return Response.json(await getAudioAnalysisAdminData(
      { query, status: status as AudioAnalysisStatus | undefined, page, limit },
      getDatabasePool(),
    ));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
