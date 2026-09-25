import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { createHomeStory, listHomeContent, parseHomeContentInput } from "@/lib/home/content";

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json(await listHomeContent(getDatabasePool(), true));
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
    return Response.json(await createHomeStory(parseHomeContentInput(await request.json()), getDatabasePool()), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_home_content" }, { status: 400 });
    return adminErrorResponse(error);
  }
}
