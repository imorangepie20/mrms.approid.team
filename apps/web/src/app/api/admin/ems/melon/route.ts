import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { createMelonIngestion, getMelonIngestion } from "@/lib/ems/melon-ingestion";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await getMelonIngestion(getDatabasePool()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAuth0Subject();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(process.env.APP_BASE_URL || request.url).origin) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    return Response.json({ id: await createMelonIngestion(getDatabasePool()) }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ code: "melon_job_already_open" }, { status: 409 });
    }
    return adminErrorResponse(error);
  }
}
