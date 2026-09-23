import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { setEmsAdminIngestionStatus } from "@/lib/ems/admin-ingestion";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    const appOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
    if (origin && origin !== appOrigin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    let body: { action?: unknown };
    try {
      body = await request.json() as { action?: unknown };
    } catch {
      return Response.json({ code: "invalid_admin_ingest_body" }, { status: 400 });
    }
    if (!body || (body.action !== "pause" && body.action !== "resume")) {
      return Response.json({ code: "invalid_admin_ingest_action" }, { status: 400 });
    }
    const { id } = await context.params;
    const changed = await setEmsAdminIngestionStatus(id, body.action, getDatabasePool());
    return changed ? Response.json({ id, status: body.action === "pause" ? "paused" : "pending" }) : Response.json({ code: "admin_ingest_transition_conflict" }, { status: 409 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
