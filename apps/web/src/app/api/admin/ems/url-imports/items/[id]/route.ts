import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { decideManualUrlImportItem } from "@/lib/ems/manual-url-import";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_BASE_URL || request.url).origin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    let body: { action?: unknown };
    try { body = await request.json() as { action?: unknown }; }
    catch { return Response.json({ code: "invalid_manual_import_action" }, { status: 400 }); }
    if (body.action !== "approve" && body.action !== "reject") {
      return Response.json({ code: "invalid_manual_import_action" }, { status: 400 });
    }
    const { id } = await context.params;
    const changed = await decideManualUrlImportItem(getDatabasePool(), id, body.action);
    return changed
      ? Response.json({ id, status: body.action === "approve" ? "approved" : "rejected" })
      : Response.json({ code: "manual_import_transition_conflict" }, { status: 409 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
