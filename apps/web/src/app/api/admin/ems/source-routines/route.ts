import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { listEmsSourceRoutines } from "@/lib/ems/source-routines";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await listEmsSourceRoutines(getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
