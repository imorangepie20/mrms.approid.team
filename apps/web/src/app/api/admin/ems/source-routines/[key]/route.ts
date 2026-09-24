import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { updateEmsSourceRoutine } from "@/lib/ems/source-routines";

type Context = { params: Promise<{ key: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    const appOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
    if (origin && origin !== appOrigin) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    const body = await request.json() as { action?: unknown };
    if (body.action !== "enable" && body.action !== "disable" && body.action !== "check_now") {
      return Response.json({ code: "invalid_ems_source_action" }, { status: 400 });
    }
    const { key } = await context.params;
    if (!["tidal_editorial", "musicbrainz_core", "musicbrainz_canonical", "musicbrainz_metadata"].includes(key)) {
      return Response.json({ code: "invalid_ems_source_key" }, { status: 400 });
    }
    return Response.json(await updateEmsSourceRoutine(key, body.action, getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
