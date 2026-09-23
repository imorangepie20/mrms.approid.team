import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/api/admin-response";
import { getDatabasePool } from "@/lib/db/pool";
import { getEmsAdminSummary } from "@/lib/ems/admin";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await getEmsAdminSummary(getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
