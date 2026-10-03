import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { applyEditorialRefresh, EditorialRefreshError } from "@/lib/ems/editorial-refresh";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_BASE_URL || request.url).origin) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("action" in body) || body.action !== "apply") {
      return Response.json({ code: "invalid_editorial_refresh_action" }, { status: 400 });
    }
    const { id } = await context.params;
    return Response.json(await applyEditorialRefresh(getDatabasePool(), id, actor));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_editorial_refresh_action" }, { status: 400 });
    if (error instanceof EditorialRefreshError) return Response.json({ code: error.code }, { status: error.status });
    return adminErrorResponse(error);
  }
}
