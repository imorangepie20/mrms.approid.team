import { describe, expect, it, vi } from "vitest";

import {
  getEmsAdminSummary,
  listEmsAdminSections,
  listEmsAdminTracks,
  listEmsIngestRuns,
  updateEmsSection,
} from "./admin";

function executor() {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("ems_admin_summary_counts")) {
      return { rows: [{ active_track_count: 12, artwork_missing_count: 2, active_section_count: 4 }] };
    }
    if (sql.includes("ems_admin_embedding_counts")) {
      return { rows: [{ status: "completed", count: 8 }, { status: "pending", count: 3 }, { status: "missing", count: 1 }] };
    }
    if (sql.includes("ems_admin_latest_ingest")) {
      return { rows: [{ id: "run-1", run_type: "tidal_resolve", status: "completed", requested_count: 12, matched_count: 10, error_code: null, created_at: "2026-09-23T00:00:00.000Z" }] };
    }
    if (sql.includes("ems_admin_sections")) {
      return { rows: [{ id: "section-1", slug: "new-releases", title: "신곡 퍼레이드", description: "새 음악", sort_order: 0, active: true, track_count: 12, updated_at: "2026-09-23T00:00:00.000Z" }] };
    }
    if (sql.includes("ems_admin_track_count")) return { rows: [{ total_count: 1 }] };
    if (sql.includes("ems_admin_tracks")) {
      return { rows: [{ id: "track-1", tidal_id: "tidal-1", title: "Track", artist: "Artist", album: "Album", duration_ms: 180000, artwork_url: "https://img/1.jpg", playback_available: true, embedding_status: "completed", sections: [{ slug: "new-releases", title: "신곡 퍼레이드" }] }] };
    }
    if (sql.includes("ems_admin_ingest_runs")) {
      return { rows: [{ id: "run-1", run_type: "tidal_resolve", status: "completed", requested_count: 12, matched_count: 10, error_code: null, created_at: "2026-09-23T00:00:00.000Z" }] };
    }
    if (sql.includes("ems_admin_update_section")) {
      return { rows: [{ id: "section-1", slug: "new-releases", title: values[0], description: values[1], sort_order: values[2], active: values[3], track_count: 12, updated_at: "2026-09-23T00:00:00.000Z" }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  return { query };
}

describe("EMS admin repository", () => {
  it("combines catalog, embedding, and ingest health into a summary", async () => {
    await expect(getEmsAdminSummary(executor() as never)).resolves.toEqual({
      activeTrackCount: 12,
      activeSectionCount: 4,
      artworkMissingCount: 2,
      embeddingCounts: { completed: 8, pending: 3, missing: 1 },
      latestIngest: expect.objectContaining({ id: "run-1", matchedCount: 10 }),
    });
  });

  it("maps section rows with track counts", async () => {
    await expect(listEmsAdminSections(executor() as never)).resolves.toEqual([
      expect.objectContaining({ slug: "new-releases", trackCount: 12 }),
    ]);
  });

  it("searches tracks and maps playback, artwork, memberships, and embedding", async () => {
    const result = await listEmsAdminTracks({ query: "Track", page: 1, limit: 24 }, executor() as never);
    expect(result).toEqual({
      totalCount: 1,
      page: 1,
      limit: 24,
      nextPage: null,
      tracks: [expect.objectContaining({ tidalTrackId: "tidal-1", embeddingStatus: "completed", sections: [{ slug: "new-releases", title: "신곡 퍼레이드" }] })],
    });
  });

  it("lists ingest runs without exposing provider payloads", async () => {
    const runs = await listEmsIngestRuns({ page: 1, limit: 20 }, executor() as never);
    expect(runs[0]).toMatchObject({ id: "run-1", requestedCount: 12, matchedCount: 10 });
  });

  it("validates and updates only editable section fields", async () => {
    const db = executor();
    await expect(updateEmsSection("section-1", { title: "수정", description: "설명", sortOrder: 2, active: false }, db as never)).resolves.toMatchObject({ title: "수정", sortOrder: 2, active: false, trackCount: 12 });
    expect(db.query.mock.calls.at(-1)?.[0]).toContain("ems_track_sections");
    await expect(updateEmsSection("section-1", { title: "", description: "설명", sortOrder: 2, active: false }, executor() as never)).rejects.toThrow("invalid_section_title");
    await expect(updateEmsSection("section-1", { title: "수정", description: "설명", sortOrder: -1, active: false }, executor() as never)).rejects.toThrow("invalid_section_sort_order");
  });
});
