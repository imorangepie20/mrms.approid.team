import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { createEmsAdminIngestion, getEmsAdminIngestion } from "@/lib/ems/admin-ingestion";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await getEmsAdminIngestion(getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    const appOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
    if (origin && origin !== appOrigin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    const id = await createEmsAdminIngestion(getDatabasePool());
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ code: "admin_ingest_already_open" }, { status: 409 });
    }
    return adminErrorResponse(error);
  }
}
