import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { listEmsAdminTracks } from "@/lib/ems/admin";

const EMBEDDING_STATUSES = new Set(["missing", "pending", "running", "completed", "failed"]);
const TRACK_STATUSES = new Set(["active", "candidate", "stale", "inactive", "rejected"]);

export async function GET(request: Request) {
  try {
    await requireAdminAuth0Subject();
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() ?? "";
    const page = Number(params.get("page") ?? 1);
    const limit = Number(params.get("limit") ?? 24);
    const status = params.get("status") || undefined;
    const embeddingStatus = params.get("embeddingStatus") || undefined;
    if (!Number.isInteger(page) || page < 1 || page > 100_000 || !Number.isInteger(limit) || limit < 1 || limit > 100 || query.length > 120 || (status && !TRACK_STATUSES.has(status)) || (embeddingStatus && !EMBEDDING_STATUSES.has(embeddingStatus))) {
      return Response.json({ code: "invalid_admin_track_filter" }, { status: 400 });
    }
    return Response.json(await listEmsAdminTracks({ query, page, limit, status, embeddingStatus }, getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
