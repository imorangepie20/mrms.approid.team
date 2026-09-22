import { describe, expect, it } from "vitest";

import { listEmsSections } from "./sections";

type SectionRow = {
  slug: string;
  section_title: string;
  section_description: string;
  sort_order: number;
  rank: number;
  track_id: string;
  tidal_id: string;
  track_title: string;
  artist: string;
  album: string;
  duration_ms: number;
};

function row(slug: string, sortOrder: number, trackId: string, rank: number): SectionRow {
  return {
    slug,
    section_title: slug === "new-releases" ? "신곡 퍼레이드" : "재즈",
    section_description: "설명",
    sort_order: sortOrder,
    rank,
    track_id: trackId,
    tidal_id: `tidal-${trackId}`,
    track_title: `Track ${trackId}`,
    artist: "Artist",
    album: "Album",
    duration_ms: 180_000,
  };
}

function fakeExecutor(fixtures: {
  count: Array<{ total_count: number }>;
  sectionRows: SectionRow[];
}) {
  const sql: string[] = [];
  return {
    sql,
    async query(statement: string) {
      sql.push(statement);
      return {
        rows: statement.includes("count(*)") ? fixtures.count : fixtures.sectionRows,
      };
    },
  };
}

describe("EMS editorial section repository", () => {
  it("orders sections, deduplicates tracks, and reports the real total", async () => {
    const executor = fakeExecutor({
      count: [{ total_count: 54 }],
      sectionRows: [
        row("new-releases", 0, "track-a", 0),
        row("seasonal-jazz", 1, "track-a", 0),
        row("seasonal-jazz", 1, "track-b", 1),
      ],
    });

    await expect(
      listEmsSections(
        { limit: 12, sectionLimit: 5, region: "KR" },
        executor as never,
      ),
    ).resolves.toMatchObject({
      totalCount: 54,
      sections: [
        { slug: "new-releases", tracks: [{ id: "track-a" }] },
        { slug: "seasonal-jazz", tracks: [{ id: "track-b" }] },
      ],
    });
  });

  it("uses only the newest KR STREAM availability event", async () => {
    const executor = fakeExecutor({ count: [], sectionRows: [] });

    await listEmsSections({ region: "KR" }, executor as never);

    expect(executor.sql.join("\n")).toMatch(
      /ORDER BY a\.observed_at DESC[\s\S]*LIMIT 1/i,
    );
  });
});
