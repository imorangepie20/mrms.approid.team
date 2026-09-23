import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { updateEmsSection, type EmsSectionPatch } from "@/lib/ems/admin";

const PATCH_FIELDS = ["title", "description", "sortOrder", "active"] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminAuth0Subject();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Object.keys(body).some((key) => !PATCH_FIELDS.includes(key as (typeof PATCH_FIELDS)[number]))) {
      return Response.json({ code: "invalid_admin_section_patch" }, { status: 400 });
    }
    const patch = body as Partial<EmsSectionPatch>;
    if (typeof patch.title !== "string" || typeof patch.description !== "string" || typeof patch.sortOrder !== "number" || typeof patch.active !== "boolean") {
      return Response.json({ code: "invalid_admin_section_patch" }, { status: 400 });
    }
    const { id } = await context.params;
    return Response.json(await updateEmsSection(id, patch as EmsSectionPatch, getDatabasePool()));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_admin_section_patch" }, { status: 400 });
    return adminErrorResponse(error);
  }
}
