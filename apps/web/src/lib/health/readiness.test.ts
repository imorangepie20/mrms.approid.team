import { describe, expect, it, vi } from "vitest";

import { checkDatabaseReadiness } from "./readiness";

describe("checkDatabaseReadiness", () => {
  it("returns true when SELECT 1 succeeds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] });

    await expect(checkDatabaseReadiness(query)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith("SELECT 1 AS ok");
  });

  it("returns false without exposing the database error", async () => {
    const query = vi.fn().mockRejectedValue(new Error("secret host"));

    await expect(checkDatabaseReadiness(query)).resolves.toBe(false);
  });
});
