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
    async query(statement: string, values: unknown[] = []) {
      sql.push(statement);
      if (statement.includes("count(*)")) return { rows: fixtures.count };
      const candidateLimit = Number(values.at(-1));
      let rows = fixtures.sectionRows.filter((item) => item.rank < candidateLimit);
      if (statement.includes("LIMIT $2")) {
        const sectionLimit = Number(values[1]);
        rows = rows.filter((item) => item.sort_order < sectionLimit);
      }
      return {
        rows,
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

  it("fetches deeper candidates so later sections can replace global duplicates", async () => {
    const first = Array.from({ length: 12 }, (_, index) =>
      row("new-releases", 0, `shared-${index}`, index),
    );
    const second = [
      ...Array.from({ length: 12 }, (_, index) =>
        row("seasonal-jazz", 1, `shared-${index}`, index),
      ),
      row("seasonal-jazz", 1, "jazz-unique", 12),
    ];
    const executor = fakeExecutor({
      count: [{ total_count: 25 }],
      sectionRows: [...first, ...second],
    });

    const result = await listEmsSections(
      { limit: 12, sectionLimit: 5, region: "KR" },
      executor as never,
    );

    expect(result.sections[1]).toMatchObject({
      slug: "seasonal-jazz",
      tracks: [{ id: "jazz-unique" }],
    });
  });

  it("applies sectionLimit after empty active sections are removed", async () => {
    const executor = fakeExecutor({
      count: [{ total_count: 3 }],
      sectionRows: [
        row("seasonal-jazz", 1, "jazz", 0),
        row("night-rnb", 2, "rnb", 0),
        row("feel-good", 3, "pop", 0),
      ],
    });

    const result = await listEmsSections(
      { limit: 12, sectionLimit: 3, region: "KR" },
      executor as never,
    );

    expect(result.sections.map((section) => section.slug)).toEqual([
      "seasonal-jazz",
      "night-rnb",
      "feel-good",
    ]);
  });
});
