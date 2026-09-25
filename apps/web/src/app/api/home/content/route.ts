import { getDatabasePool } from "@/lib/db/pool";
import { listHomeContent } from "@/lib/home/content";

export async function GET() {
  try {
    return Response.json(await listHomeContent(getDatabasePool()));
  } catch {
    return Response.json({ code: "home_content_unavailable" }, { status: 503 });
  }
}
