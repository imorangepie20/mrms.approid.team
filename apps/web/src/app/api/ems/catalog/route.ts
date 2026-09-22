import { listEmsTracks, type EmsListOptions } from "@/lib/ems/catalog";
import { getDatabasePool } from "@/lib/db/pool";

const allowedSort = new Set<EmsListOptions["sort"]>(["new", "title", "artist"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawLimit = Number(params.get("limit") ?? 24);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.trunc(rawLimit))) : 24;
  const region = (params.get("region") ?? "KR").trim().toUpperCase();
  const sort = (params.get("sort") ?? "new").trim() as EmsListOptions["sort"];
  const query = params.get("query")?.trim() ?? "";
  if (region !== "KR" || !allowedSort.has(sort) || query.length > 200) return Response.json({ code: "invalid_ems_filter" }, { status: 400 });
  try {
    const result = await listEmsTracks({ cursor: params.get("cursor") ?? undefined, limit, query, region, sort }, getDatabasePool());
    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "ems_cursor_invalid") return Response.json({ code: "invalid_ems_cursor" }, { status: 400 });
    return Response.json({ code: "ems_catalog_unavailable" }, { status: 503 });
  }
}
