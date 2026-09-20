import { Pool } from "pg";

let pool: Pool | null = null;

export function getDatabasePool() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL access.");
  }

  pool ??= new Pool({ connectionString });
  return pool;
}
