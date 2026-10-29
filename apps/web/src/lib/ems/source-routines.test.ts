import { describe, expect, it, vi } from "vitest";

import { EMS_SOURCE_ROUTINE_KEYS, isEmsSourceRoutineKey, updateEmsSourceRoutine } from "./source-routines";

const row = {
  source_key: "lastfm_artist_tags", enabled: false, check_interval_seconds: 3600, status: "idle",
  next_check_at: "2026-10-29T00:00:00.000Z", last_checked_at: null, last_version: null, last_success_at: null,
  last_candidate_count: 0, current_run_id: null, current_run_status: null, current_run_matched_count: null,
  current_run_pending_count: null, error_code: null,
};

describe("EMS source routine allowlist", () => {
  it("includes every routine seeded by migrations, including the attribute routines", () => {
    expect([...EMS_SOURCE_ROUTINE_KEYS].sort()).toEqual([
      "lastfm_artist_tags", "melon_genres", "music_attributes", "musicbrainz_canonical",
      "musicbrainz_core", "musicbrainz_metadata", "tidal_editorial",
    ]);
    expect(isEmsSourceRoutineKey("music_attributes")).toBe(true);
    expect(isEmsSourceRoutineKey("unknown_source")).toBe(false);
  });

  it.each(["lastfm_artist_tags", "music_attributes"])("allows disabling %s", async (key) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ...row, source_key: key }] });
    const result = await updateEmsSourceRoutine(key, "disable", { query });
    expect(result.key).toBe(key);
    expect(query.mock.calls[0][1]).toEqual([key, "disable"]);
  });

  it("rejects unknown keys before touching the database", async () => {
    const query = vi.fn();
    await expect(updateEmsSourceRoutine("unknown_source", "enable", { query })).rejects.toThrow("invalid_ems_source_key");
    expect(query).not.toHaveBeenCalled();
  });
});
