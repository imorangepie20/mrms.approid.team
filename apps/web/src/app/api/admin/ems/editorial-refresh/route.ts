import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { createEditorialRefresh, EditorialRefreshError, listEditorialRefreshes } from "@/lib/ems/editorial-refresh";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await listEditorialRefreshes(getDatabasePool()), { headers: { "cache-control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_BASE_URL || request.url).origin) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) return Response.json({ code: "invalid_editorial_refresh_request" }, { status: 400 });
    return Response.json(await createEditorialRefresh(getDatabasePool(), actor), { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_editorial_refresh_request" }, { status: 400 });
    if (error instanceof EditorialRefreshError) return Response.json({ code: error.code }, { status: error.status });
    return adminErrorResponse(error);
  }
}
