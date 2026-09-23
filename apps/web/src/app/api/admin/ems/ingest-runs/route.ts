import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { listEmsIngestRuns } from "@/lib/ems/admin";

export async function GET(request: Request) {
  try {
    await requireAdminAuth0Subject();
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 1);
    const limit = Number(params.get("limit") ?? 20);
    if (!Number.isInteger(page) || page < 1 || page > 100_000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return Response.json({ code: "invalid_admin_ingest_filter" }, { status: 400 });
    }
    return Response.json(await listEmsIngestRuns({ page, limit }, getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
