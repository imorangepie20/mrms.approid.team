import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { changeSpotifyChartRun } from "@/lib/ems/spotify-charts";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_BASE_URL || request.url).origin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    let body: { action?: unknown };
    try {
      body = await request.json() as { action?: unknown };
    } catch {
      return Response.json({ code: "invalid_spotify_chart_action" }, { status: 400 });
    }
    if (body.action !== "pause" && body.action !== "resume") {
      return Response.json({ code: "invalid_spotify_chart_action" }, { status: 400 });
    }
    const { id } = await context.params;
    const changed = await changeSpotifyChartRun(getDatabasePool(), id, body.action);
    return changed
      ? Response.json({ id: changed.run_id, status: changed.status })
      : Response.json({ code: "spotify_chart_transition_conflict" }, { status: 409 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
