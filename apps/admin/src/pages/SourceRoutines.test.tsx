import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EmsSourceRoutine } from "../lib/api";
import { RoutineCard, routineLabel } from "./SourceRoutines";

function routine(key: string): EmsSourceRoutine {
  return {
    key: key as EmsSourceRoutine["key"],
    enabled: true,
    intervalSeconds: 21600,
    status: "idle",
    nextCheckAt: "2026-10-29T00:00:00.000Z",
    lastCheckedAt: null,
    lastVersion: null,
    lastSuccessAt: null,
    lastCandidateCount: 0,
    currentRunId: null,
    currentRunStatus: null,
    currentRunMatchedCount: 0,
    currentRunPendingCount: 0,
    errorCode: null,
  };
}

function render(key: string) {
  return renderToStaticMarkup(<RoutineCard routine={routine(key)} busy={false} onAction={() => undefined} />);
}

describe("source routine cards", () => {
  it("renders Korean labels for the language/genre attribute routines", () => {
    const lastfm = render("lastfm_artist_tags");
    expect(lastfm).toContain("Last.fm 아티스트 태그");
    expect(lastfm).toContain("지금 확인");
    const attributes = render("music_attributes");
    expect(attributes).toContain("언어·장르 속성");
    expect(attributes).toContain("지금 확인");
  });

  it("falls back to the raw key instead of crashing on an unknown routine", () => {
    expect(routineLabel("future_source").title).toBe("future_source");
    const html = render("future_source");
    expect(html).toContain("future_source");
    expect(html).toContain("설명 없음");
  });

  it("keeps existing labels", () => {
    expect(render("melon_genres")).toContain("멜론 한국대중음악");
  });
});
