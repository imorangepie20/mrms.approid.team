import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import { deleteHomeStory, parseHomeContentInput, updateHomeContent } from "@/lib/home/content";

function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(process.env.APP_BASE_URL || request.url).origin;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAuth0Subject();
    if (!checkOrigin(request)) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    const { id } = await context.params;
    return Response.json(await updateHomeContent(id, parseHomeContentInput(await request.json()), getDatabasePool()));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ code: "invalid_home_content" }, { status: 400 });
    if (error instanceof Error && error.message === "home_content_not_found") return Response.json({ code: error.message }, { status: 404 });
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAuth0Subject();
    if (!checkOrigin(request)) return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    const { id } = await context.params;
    await deleteHomeStory(id, getDatabasePool());
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "home_content_not_found") return Response.json({ code: error.message }, { status: 404 });
    return adminErrorResponse(error);
  }
}
