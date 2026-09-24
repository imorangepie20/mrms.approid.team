import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { getEmsStatistics } from "@/lib/ems/statistics";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await getEmsStatistics(getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
