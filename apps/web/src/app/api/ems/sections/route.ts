import { getDatabasePool } from "@/lib/db/pool";
import { listEmsSections } from "@/lib/ems/sections";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const region = (params.get("region") ?? "KR").trim().toUpperCase();
  const limit = Number(params.get("limit") ?? 12);
  const sectionLimit = Number(params.get("sectionLimit") ?? 5);
  if (
    region !== "KR" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 12 ||
    !Number.isInteger(sectionLimit) ||
    sectionLimit < 1 ||
    sectionLimit > 5
  ) {
    return Response.json(
      { code: "invalid_ems_section_filter" },
      { status: 400 },
    );
  }
  try {
    return Response.json(
      await listEmsSections(
        { limit, region, sectionLimit },
        getDatabasePool(),
      ),
    );
  } catch {
    return Response.json({ code: "ems_sections_unavailable" }, { status: 503 });
  }
}
