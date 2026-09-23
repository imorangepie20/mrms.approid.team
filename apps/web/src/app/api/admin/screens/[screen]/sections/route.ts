import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { listEmsAdminSections } from "@/lib/ems/admin";

export async function GET(_request: Request, context: { params: Promise<{ screen: string }> }) {
  try {
    await requireAdminAuth0Subject();
    const { screen } = await context.params;
    if (screen !== "home" && screen !== "ems") {
      return Response.json({ code: "invalid_admin_screen" }, { status: 400 });
    }
    return Response.json(await listEmsAdminSections(getDatabasePool(), screen));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
