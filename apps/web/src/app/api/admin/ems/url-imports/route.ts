import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { classifyManualMusicUrl, createManualUrlImport, listManualUrlImports } from "@/lib/ems/manual-url-import";

function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(process.env.APP_BASE_URL || request.url).origin;
}

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json({ jobs: await listManualUrlImports(getDatabasePool()) });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminAuth0Subject();
    if (!originAllowed(request)) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    let body: { url?: unknown };
    try { body = await request.json() as { url?: unknown }; }
    catch { return Response.json({ code: "invalid_manual_music_url" }, { status: 400 }); }
    if (typeof body.url !== "string" || !classifyManualMusicUrl(body.url.trim())) {
      return Response.json({ code: "invalid_manual_music_url" }, { status: 400 });
    }
    const id = await createManualUrlImport(getDatabasePool(), body.url.trim(), actor);
    return Response.json({ id, status: "pending" }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
