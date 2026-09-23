import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { listEmsAdminSections } from "@/lib/ems/admin";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await listEmsAdminSections(getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
