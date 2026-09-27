import { describe, expect, it } from "vitest";
import {
  changeSpotifyChartRun,
  createSpotifyChartRun,
  listSpotifyChartRuns,
  SPOTIFY_CHART_TARGETS,
} from "./spotify-charts";

describe("Spotify chart admin data", () => {
  it("pins the requested four public chart playlists", () => {
    expect(SPOTIFY_CHART_TARGETS.map((target) => target.id)).toEqual([
      "37i9dQZEVXbNG2KDcFcKOF",
      "37i9dQZEVXbJZGli0rRP3r",
      "37i9dQZEVXbMDoHDwVN2tF",
      "37i9dQZEVXbNxXF4SkHj9F",
    ]);
  });

  it("creates a run with the 450 request hard cap", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const id = await createSpotifyChartRun({
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        return { rows: [{ id: "run-1" }] };
      },
    } as never, "auth0|admin");
    expect(id).toBe("run-1");
    expect(calls[0]?.sql).toContain("'pending', 450, 0");
    expect(calls[0]?.values).toEqual(["auth0|admin"]);
  });

  it("only resumes paused runs while budget remains", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    await changeSpotifyChartRun({
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql, values });
        return { rows: [{ run_id: "12345678-1234-1234-1234-123456789abc", status: "pending" }] };
      },
    } as never, "12345678-1234-1234-1234-123456789abc", "resume");
    expect(calls[0]?.sql).toContain("tidal_request_count < 450");
    expect(calls[0]?.sql).toContain("ELSE 'resolving'");
    expect(calls[0]?.sql).not.toContain("SET next_attempt_at = now()");
    expect(calls[0]?.values).toEqual([
      "12345678-1234-1234-1234-123456789abc",
      "pending",
      ["paused"],
    ]);
  });

  it("maps aggregate run and playlist counts", async () => {
    let call = 0;
    const runs = await listSpotifyChartRuns({
      async query() {
        call += 1;
        if (call === 1) return { rows: [{
          id: "run-1", status: "completed", phase: "finished",
          spotify_request_budget: 4, spotify_request_count: 4,
          tidal_request_budget: 450, tidal_request_count: 120,
          requested_count: 80, matched_count: 70, pending_count: 0,
          ambiguous_count: 2, not_found_count: 5, unavailable_count: 3,
          retryable_count: 0, budget_exhausted_count: 0,
          playlist_count: 4, membership_count: 200, active: true,
          error_code: null, created_by: "admin", created_at: "created",
          updated_at: "updated", activated_at: "active", finished_at: "finished",
        }] };
        return { rows: [{
          run_id: "run-1", spotify_id: SPOTIFY_CHART_TARGETS[0].id,
          title: SPOTIFY_CHART_TARGETS[0].title, description: "description",
          artwork_url: null, source_url: "https://open.spotify.com/playlist/id",
          display_order: 0, source_track_count: 50, matched_count: 45,
        }] };
      },
    } as never);
    expect(runs[0]).toMatchObject({
      playlistCount: 4,
      membershipCount: 200,
      matchedCount: 70,
      active: true,
      playlists: [{ sourceTrackCount: 50, matchedCount: 45 }],
    });
  });
});
