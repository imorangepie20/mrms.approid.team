import { getDatabasePool } from "@/lib/db/pool";

type ReadinessQuery = (text: string) => Promise<unknown>;

export async function checkDatabaseReadiness(
  query: ReadinessQuery = (text) => getDatabasePool().query(text),
) {
  try {
    await query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}
