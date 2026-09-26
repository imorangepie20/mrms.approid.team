import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { startApprovedManualUrlImport } from "@/lib/ems/manual-url-import";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_BASE_URL || request.url).origin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    const { id } = await context.params;
    const started = await startApprovedManualUrlImport(getDatabasePool(), id);
    return started
      ? Response.json({ id, status: "processing" }, { status: 202 })
      : Response.json({ code: "manual_import_transition_conflict" }, { status: 409 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ code: "ems_ingestion_already_running" }, { status: 409 });
    }
    return adminErrorResponse(error);
  }
}
