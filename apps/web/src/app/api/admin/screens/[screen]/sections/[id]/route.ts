import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { updateEmsSection, type EmsSectionPatch } from "@/lib/ems/admin";

const PATCH_FIELDS = ["title", "description", "sortOrder", "active"] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ screen: string; id: string }> },
) {
  try {
    await requireAdminAuth0Subject();
    const { screen, id } = await context.params;
    if (screen !== "home" && screen !== "ems") {
      return Response.json({ code: "invalid_admin_screen" }, { status: 400 });
    }
    const origin = request.headers.get("origin");
    const appOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
    if (origin && origin !== appOrigin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Object.keys(body).some((key) => !PATCH_FIELDS.includes(key as (typeof PATCH_FIELDS)[number]))) {
      return Response.json({ code: "invalid_admin_section_patch" }, { status: 400 });
    }
    const patch = body as Partial<EmsSectionPatch>;
    if (typeof patch.title !== "string" || typeof patch.description !== "string" || typeof patch.sortOrder !== "number" || typeof patch.active !== "boolean") {
      return Response.json({ code: "invalid_admin_section_patch" }, { status: 400 });
    }
    return Response.json(await updateEmsSection(id, patch as EmsSectionPatch, getDatabasePool(), screen));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_admin_section_patch" }, { status: 400 });
    return adminErrorResponse(error);
  }
}
