import { checkDatabaseReadiness } from "@/lib/health/readiness";

export async function GET() {
  const ready = await checkDatabaseReadiness();

  return Response.json(
    { status: ready ? "ready" : "unavailable" },
    { status: ready ? 200 : 503 },
  );
}
