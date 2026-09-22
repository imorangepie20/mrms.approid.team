# Home and EMS Editorial Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인과 EMS에 실제 TIDAL 에디토리얼 근거를 가진 `신곡 퍼레이드`형 큐레이션 섹션을 표시한다.

**Architecture:** EMS pipeline이 TIDAL 공개 에디토리얼 플레이리스트와 기존 `ems_tracks`를 조인해 section membership을 저장한다. Web은 저장된 section만 읽는 API와 공유 rail 컴포넌트를 제공하며, 메인은 상위 3개, EMS는 전체 section과 검색 결과를 표시한다. EMS 탐색은 embedding 완료 여부와 분리한다.

**Tech Stack:** Python 3.12, httpx, psycopg 3, PostgreSQL 16/pgvector, Next.js 16 App Router, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-09-22-ems-editorial-sections-design.md`

## Global Constraints

- 섹션 제목은 `신곡 퍼레이드`, `시원한 가을 바람과 함께, 재즈`처럼 청취 상황과 분위기를 제안한다.
- 분류는 TIDAL 공개 `EDITORIAL` 플레이리스트 provenance로 설명 가능해야 한다.
- KR `STREAM`, 30초 이상, ISRC 보유 조건을 유지한다.
- 메인은 우선순위 상위 3개, EMS는 전체 4~5개 섹션을 사용한다.
- 각 섹션은 최대 12곡이며 한 응답에서 같은 EMS track을 반복하지 않는다.
- EMS 탐색은 embedding 완료 여부에 의존하지 않는다. embedding은 GMS 준비 상태다.
- TIDAL token, secret, raw 응답은 로그·DB·저장소에 기록하지 않는다.
- 계절 문구는 날짜로 자동 추측하지 않고 저장된 section 문구를 운영자가 명시적으로 갱신한다.
- 기존 사용자 파일 `docs/plans/portable-self-hosted-deployment-guide.md`는 변경하거나 커밋하지 않는다.

## Review Focus

- 오래된 playable event 뒤에 최신 unavailable event가 있는 track은 EMS와 section API에서 숨겨야 한다.
- 하나의 track이 여러 section에 속하면 앞선 section에만 나타나야 한다.
- 외부 origin, 반복 cursor, 100 page 초과 TIDAL pagination은 token을 보내기 전에 중단해야 한다.
- 검색 요청이 취소되거나 실패해도 이미 로드된 editorial section은 보존돼야 한다.
- membership이 없는 section은 제외하고 전체가 비었으면 준비 중 상태를 표시해야 한다.

---

## File Map

- `apps/web/src/lib/db/migrations/009_ems_editorial_sections.sql`: section과 track membership 스키마.
- `apps/web/src/lib/db/migrations/009_ems_editorial_sections.down.sql`: 신규 객체만 역순 제거.
- `apps/web/src/lib/db/migrations/009_ems_editorial_sections.test.ts`: migration 경계 검증.
- `services/ems-pipeline/src/ems_pipeline/tidal_popularity.py`: 재사용 가능한 editorial playlist/track fetch 경계.
- `services/ems-pipeline/src/ems_pipeline/editorial_sections.py`: section 정의, 순위, DB 동기화.
- `services/ems-pipeline/src/ems_pipeline/cli.py`: `sync-editorial-sections` 명령.
- `services/ems-pipeline/tests/test_editorial_sections.py`: 분류·중복·transaction·dry-run 검증.
- `apps/web/src/lib/ems/catalog.ts`: embedding 비의존 EMS catalog 조회.
- `apps/web/src/lib/ems/sections.ts`: section 조회, 최신 availability, 응답 내 dedupe.
- `apps/web/src/lib/ems/sections.test.ts`: section repository 검증.
- `apps/web/src/app/api/ems/sections/route.ts`: 공개 section API.
- `apps/web/src/app/api/ems/sections/route.test.ts`: query validation과 오류 경계.
- `apps/web/src/lib/ems/client.ts`: 브라우저용 section/catalog fetch 함수와 타입.
- `apps/web/src/components/ems/editorial-section-rail.tsx`: 메인·EMS 공유 rail.
- `apps/web/src/components/ems/editorial-section-rail.test.tsx`: rail 재생 queue·링크·접근성.
- `apps/web/src/components/ems/ems-browser.tsx`: 전체 section, 검색 전환, 상태 처리.
- `apps/web/src/components/ems/ems-browser.test.tsx`: EMS 화면 회귀 테스트.
- `apps/web/src/components/dashboard/music-dashboard.tsx`: fixture Home을 실제 section 3개로 교체.
- `apps/web/src/components/dashboard/music-dashboard.test.tsx`, `apps/web/src/app/page.test.tsx`: 메인 회귀 테스트.
- `docs/changes/2026-09-22-ems-editorial-sections.md`, `docs/overview/current-development-context.md`: 구현·검증·운영 결과.

---

### Task 1: Editorial Section Schema

**Files:**
- Create: `apps/web/src/lib/db/migrations/009_ems_editorial_sections.sql`
- Create: `apps/web/src/lib/db/migrations/009_ems_editorial_sections.down.sql`
- Create: `apps/web/src/lib/db/migrations/009_ems_editorial_sections.test.ts`

**Interfaces:**
- Consumes: existing `ems_tracks(id)` from migration 008.
- Produces: `ems_editorial_sections` and `ems_track_sections` tables used by pipeline and Web.

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const up = readFileSync(join(root, "009_ems_editorial_sections.sql"), "utf8");
const down = readFileSync(join(root, "009_ems_editorial_sections.down.sql"), "utf8");

describe("EMS editorial section migration", () => {
  it("creates ordered sections and traceable track membership", () => {
    expect(up).toMatch(/CREATE TABLE ems_editorial_sections/i);
    expect(up).toMatch(/slug TEXT NOT NULL UNIQUE/i);
    expect(up).toMatch(/CREATE TABLE ems_track_sections/i);
    expect(up).toMatch(/PRIMARY KEY \(section_id, track_id\)/i);
    expect(up).toMatch(/source_playlist_id TEXT NOT NULL/i);
    expect(up).not.toMatch(/ALTER TABLE\s+(music_tracks|track_embeddings)/i);
  });

  it("drops only the two new tables in dependency order", () => {
    expect(down.indexOf("ems_track_sections")).toBeLessThan(down.indexOf("ems_editorial_sections"));
    expect(down).not.toMatch(/DROP TABLE IF EXISTS\s+ems_tracks/i);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm --prefix apps/web test -- src/lib/db/migrations/009_ems_editorial_sections.test.ts`

Expected: FAIL because both SQL files are missing.

- [ ] **Step 3: Add the forward and rollback migrations**

```sql
BEGIN;

CREATE TABLE ems_editorial_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ems_track_sections (
  section_id UUID NOT NULL REFERENCES ems_editorial_sections(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 0),
  source_playlist_id TEXT NOT NULL,
  source_playlist_name TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, track_id)
);

CREATE INDEX ems_editorial_sections_active_idx
  ON ems_editorial_sections (active, sort_order);
CREATE INDEX ems_track_sections_rank_idx
  ON ems_track_sections (section_id, rank, track_id);

COMMIT;
```

Rollback file:

```sql
BEGIN;
DROP TABLE IF EXISTS ems_track_sections;
DROP TABLE IF EXISTS ems_editorial_sections;
COMMIT;
```

- [ ] **Step 4: Run migration tests**

Run: `npm --prefix apps/web test -- src/lib/db/migrations/008_ems_catalog.test.ts src/lib/db/migrations/009_ems_editorial_sections.test.ts`

Expected: both files PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/db/migrations/009_ems_editorial_sections.*
git commit -m "feat(ems): add editorial section schema"
```

---

### Task 2: Reusable TIDAL Editorial Discovery

**Files:**
- Modify: `services/ems-pipeline/src/ems_pipeline/tidal_popularity.py`
- Create: `services/ems-pipeline/src/ems_pipeline/editorial_sections.py`
- Create: `services/ems-pipeline/tests/test_editorial_sections.py`

**Interfaces:**
- Consumes: `TidalCatalogClient`, `EditorialPlaylist`, `EditorialTrack`.
- Produces: `SECTION_DEFINITIONS`, `discover_editorial_memberships(client, token) -> list[EditorialMembership]`.

- [ ] **Step 1: Write failing section classification and pagination tests**

```python
import pytest

from ems_pipeline.editorial_sections import (
    SECTION_DEFINITIONS,
    EditorialMembership,
    rank_section_tracks,
)
from ems_pipeline.tidal_popularity import EditorialTrack, resolve_next_page_url


def test_definitions_keep_approved_copy_and_order() -> None:
    assert [(item.slug, item.title) for item in SECTION_DEFINITIONS] == [
        ("new-releases", "신곡 퍼레이드"),
        ("seasonal-jazz", "시원한 가을 바람과 함께, 재즈"),
        ("night-rnb", "도시의 밤을 채우는 R&B"),
        ("feel-good", "기분 좋은 리듬이 필요할 때"),
        ("focus", "잠깐, 음악에만 집중"),
    ]


def test_rank_section_tracks_deduplicates_isrc_and_keeps_provenance() -> None:
    memberships = rank_section_tracks("night-rnb", [
        EditorialTrack("tidal-low", "ISRC-A", "Song", "Artist", "Album", 180000, 0.4, 100),
        EditorialTrack("tidal-high", "isrc-a", "Song", "Artist", "Album", 180000, 0.9, 1000),
    ], playlist_id="playlist-a", playlist_name="R&B Hits")
    assert memberships == [EditorialMembership(
        section_slug="night-rnb", tidal_id="tidal-high", isrc="ISRC-A",
        rank=0, source_playlist_id="playlist-a", source_playlist_name="R&B Hits",
    )]


def test_pagination_rejects_external_repeated_and_oversized_sequences() -> None:
    with pytest.raises(ValueError, match="origin"):
        resolve_next_page_url("https://openapi.tidal.com/v2", "https://evil.test/steal", set(), page_count=1)
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests/test_editorial_sections.py`

Expected: FAIL because `editorial_sections` does not exist.

- [ ] **Step 3: Add immutable section definitions and pure ranking**

```python
@dataclass(frozen=True)
class SectionDefinition:
    slug: str
    title: str
    description: str
    queries: tuple[str, ...]
    playlist_name_terms: tuple[str, ...]


@dataclass(frozen=True)
class EditorialMembership:
    section_slug: str
    tidal_id: str
    isrc: str
    rank: int
    source_playlist_id: str
    source_playlist_name: str


SECTION_DEFINITIONS = (
    SectionDefinition("new-releases", "신곡 퍼레이드", "지금 막 도착한 새로운 음악", ("Best New Tracks", "New Arrivals"), ("new", "best new")),
    SectionDefinition("seasonal-jazz", "시원한 가을 바람과 함께, 재즈", "여유로운 재즈 셀렉션", ("Jazz",), ("jazz",)),
    SectionDefinition("night-rnb", "도시의 밤을 채우는 R&B", "늦은 시간에 어울리는 부드러운 트랙", ("R&B",), ("r&b", "soul")),
    SectionDefinition("feel-good", "기분 좋은 리듬이 필요할 때", "팝과 댄스 중심의 경쾌한 음악", ("Pop", "Dance"), ("pop", "dance", "party")),
    SectionDefinition("focus", "잠깐, 음악에만 집중", "클래식과 차분한 연주곡", ("Classical", "Focus"), ("classical", "focus", "instrumental")),
)
```

`rank_section_tracks`는 ISRC 대문자로 group하고 popularity, playlist follower, stable TIDAL ID 순으로 edition을 선택한다. 30초 미만·ISRC 없음·KR `STREAM` 없음은 fetch 경계에서 제외한다.

- [ ] **Step 4: Extract reusable fetch functions without changing the 1,000-song builder output**

Add these signatures to `tidal_popularity.py` and make `build_tidal_editorial_snapshot` call them:

```python
def fetch_editorial_playlists(
    client: TidalCatalogClient,
    token: str,
    queries: Iterable[str],
) -> list[EditorialPlaylist]:
    documents = [
        _get_document(
            client,
            token,
            f"{client.api_base_url}/searchResults",
            {"filter[query]": query, "countryCode": client.country_code, "include": "playlists"},
        )
        for query in queries
    ]
    return rank_editorial_playlists(documents)

def fetch_playlist_tracks(
    client: TidalCatalogClient,
    token: str,
    playlist: EditorialPlaylist,
) -> list[EditorialTrack]:
    url = f"{client.api_base_url}/playlists/{playlist.playlist_id}/relationships/items"
    params = {"countryCode": client.country_code, "include": "items,items.albums,items.artists"}
    visited = {url}
    page_count = 0
    tracks: list[EditorialTrack] = []
    while url:
        page_count += 1
        document = _get_document(client, token, url, params)
        tracks.extend(_parse_editorial_tracks(document, playlist.followers))
        next_url = (document.get("links") or {}).get("next")
        url = resolve_next_page_url(client.api_base_url, str(next_url), visited, page_count=page_count) if next_url else ""
        params = None
    return tracks
```

Keep `resolve_next_page_url` as the only pagination URL resolver so origin, repeat, and 100-page limits cannot diverge.

- [ ] **Step 5: Run pipeline tests**

Run: `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests/test_tidal_popularity.py services/ems-pipeline/tests/test_editorial_sections.py`

Expected: PASS, including existing deterministic selection tests.

- [ ] **Step 6: Commit**

```bash
git add services/ems-pipeline/src/ems_pipeline/tidal_popularity.py services/ems-pipeline/src/ems_pipeline/editorial_sections.py services/ems-pipeline/tests/test_editorial_sections.py
git commit -m "feat(ems): classify tidal editorial sections"
```

---

### Task 3: Transactional Section Sync CLI

**Files:**
- Modify: `services/ems-pipeline/src/ems_pipeline/editorial_sections.py`
- Modify: `services/ems-pipeline/src/ems_pipeline/cli.py`
- Modify: `services/ems-pipeline/tests/test_editorial_sections.py`
- Modify: `services/ems-pipeline/tests/test_cli.py`

**Interfaces:**
- Consumes: `EditorialMembership` from Task 2 and tables from Task 1.
- Produces: `sync_editorial_sections(connection, definitions, memberships, dry_run) -> dict[str, SectionSyncCount]` and CLI command `sync-editorial-sections`.

The result type is fixed as:

```python
@dataclass(frozen=True)
class SectionSyncCount:
    discovered: int
    joined: int
    stored: int
```

- [ ] **Step 1: Add failing persistence tests**

```python
def test_sync_replaces_one_section_atomically_and_matches_tidal_id_before_isrc() -> None:
    connection = RecordingConnection(track_rows=[
        {"id": "track-a", "tidal_id": "tidal-a", "isrc": "ISRC-A"},
    ])
    result = sync_editorial_sections(connection, SECTION_DEFINITIONS[:1], [
        EditorialMembership("new-releases", "tidal-a", "ISRC-A", 0, "playlist-a", "Best New Tracks"),
    ], dry_run=False)
    sql = "\n".join(connection.statements)
    assert "INSERT INTO ems_editorial_sections" in sql
    assert "DELETE FROM ems_track_sections" in sql
    assert "INSERT INTO ems_track_sections" in sql
    assert connection.transaction_count == 1
    assert result["new-releases"].stored == 1


def test_sync_dry_run_performs_no_write() -> None:
    connection = RecordingConnection(track_rows=[])
    sync_editorial_sections(connection, SECTION_DEFINITIONS, [], dry_run=True)
    assert not any(statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for statement in connection.statements)
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests/test_editorial_sections.py services/ems-pipeline/tests/test_cli.py`

Expected: FAIL because sync and parser command are missing.

- [ ] **Step 3: Implement track join and section transaction**

Use one read query for existing active tracks:

```sql
SELECT id, tidal_id, upper(isrc) AS isrc
FROM ems_tracks
WHERE status = 'active' AND (tidal_id = ANY(%s) OR upper(isrc) = ANY(%s))
```

For each section, open one transaction, upsert copy and `sort_order`, delete previous membership for that section, then insert the current matched rows. Prefer exact `tidal_id`; use ISRC only when there is no exact ID match. Do not delete or modify `ems_tracks`.

- [ ] **Step 4: Add CLI parser and execution**

```python
sync_sections = subparsers.add_parser("sync-editorial-sections")
sync_sections.add_argument("--dry-run", action="store_true")
sync_sections.add_argument("--playlist-limit", type=int, default=12)
```

The command requires `DATABASE_URL`, `TIDAL_CLIENT_ID`, and `TIDAL_CLIENT_SECRET`, prints only JSON counts `{discovered, joined, stored}` per slug, and never prints queries or credentials.

- [ ] **Step 5: Run all pipeline tests**

Run: `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests`

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/ems-pipeline/src/ems_pipeline/editorial_sections.py services/ems-pipeline/src/ems_pipeline/cli.py services/ems-pipeline/tests/test_editorial_sections.py services/ems-pipeline/tests/test_cli.py
git commit -m "feat(ems): sync editorial section membership"
```

---

### Task 4: EMS Catalog Visibility and Section Repository

**Files:**
- Modify: `apps/web/src/lib/ems/catalog.ts`
- Modify: `apps/web/src/lib/ems/catalog.test.ts`
- Create: `apps/web/src/lib/ems/sections.ts`
- Create: `apps/web/src/lib/ems/sections.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and existing `Track` type.
- Produces: `listEmsSections(options, executor) -> Promise<EmsSectionsResponse>`.

- [ ] **Step 1: Pin the catalog visibility regression**

Change the existing catalog test to assert that generated SQL does not contain `ems_track_embeddings` and does select only the latest availability event:

```ts
expect(sql).not.toContain("ems_track_embeddings");
expect(sql).toMatch(/ORDER BY a\.observed_at DESC[\s\S]*LIMIT 1/i);
```

The SQL must use a lateral latest-event lookup so an older playable event cannot override a newer unavailable event.

- [ ] **Step 2: Write failing section repository tests**

```ts
it("orders sections, deduplicates tracks, and reports the real total", async () => {
  const executor = fakeExecutor({
    count: [{ total_count: 54 }],
    sectionRows: [
      row("new-releases", 0, "track-a", 0),
      row("seasonal-jazz", 1, "track-a", 0),
      row("seasonal-jazz", 1, "track-b", 1),
    ],
  });
  await expect(listEmsSections({ limit: 12, sectionLimit: 5, region: "KR" }, executor)).resolves.toMatchObject({
    totalCount: 54,
    sections: [
      { slug: "new-releases", tracks: [{ id: "track-a" }] },
      { slug: "seasonal-jazz", tracks: [{ id: "track-b" }] },
    ],
  });
});

it("uses only the newest KR STREAM availability event", async () => {
  await listEmsSections({ region: "KR" }, executor);
  expect(executor.sql).toMatch(/ORDER BY a\.observed_at DESC[\s\S]*LIMIT 1/i);
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npm --prefix apps/web test -- src/lib/ems/catalog.test.ts src/lib/ems/sections.test.ts`

Expected: catalog assertion and missing module FAIL.

- [ ] **Step 4: Implement repository types and queries**

```ts
export type EmsEditorialSection = {
  slug: string;
  title: string;
  description: string;
  tracks: Track[];
};

export type EmsSectionsResponse = {
  totalCount: number;
  sections: EmsEditorialSection[];
};

type EmsSectionRow = {
  slug: string;
  section_title: string;
  section_description: string;
  track_id: string;
  tidal_id: string;
  track_title: string;
  artist: string;
  album: string | null;
  duration_ms: number;
};

const COUNT_SQL = `
  SELECT count(*)::int AS total_count
  FROM ems_tracks AS e
  JOIN LATERAL (
    SELECT a.playable
    FROM ems_availability_events AS a
    WHERE a.track_id = e.id AND a.region = $1 AND a.capability = 'STREAM'
    ORDER BY a.observed_at DESC, a.id DESC
    LIMIT 1
  ) AS availability ON availability.playable = true
  WHERE e.status = 'active'`;

const SECTION_SQL = `
  WITH active_sections AS (
    SELECT id, slug, title, description, sort_order
    FROM ems_editorial_sections
    WHERE active = true
    ORDER BY sort_order, id
    LIMIT $2
  ), ranked AS (
    SELECT s.slug, s.title AS section_title, s.description AS section_description,
           s.sort_order, m.rank, e.id AS track_id, e.tidal_id,
           e.title AS track_title, e.artist, e.album, e.duration_ms,
           row_number() OVER (PARTITION BY s.id ORDER BY m.rank, e.id) AS row_number
    FROM active_sections AS s
    JOIN ems_track_sections AS m ON m.section_id = s.id
    JOIN ems_tracks AS e ON e.id = m.track_id AND e.status = 'active'
    JOIN LATERAL (
      SELECT a.playable
      FROM ems_availability_events AS a
      WHERE a.track_id = e.id AND a.region = $1 AND a.capability = 'STREAM'
      ORDER BY a.observed_at DESC, a.id DESC
      LIMIT 1
    ) AS availability ON availability.playable = true
  )
  SELECT * FROM ranked
  WHERE row_number <= $3
  ORDER BY sort_order, rank, track_id`;

function mapEmsTrack(row: EmsSectionRow): Track {
  return {
    id: row.track_id,
    tidalTrackId: row.tidal_id,
    title: row.track_title,
    artist: row.artist,
    album: row.album ?? "Unknown Album",
    durationSeconds: Math.round(row.duration_ms / 1000),
    artworkUrl: "",
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    playbackAvailable: true,
  };
}

export async function listEmsSections(
  options: { limit?: number; sectionLimit?: number; region?: string },
  executor: QueryExecutor,
): Promise<EmsSectionsResponse> {
  const limit = Math.min(12, Math.max(1, Math.trunc(options.limit ?? 12)));
  const sectionLimit = Math.min(5, Math.max(1, Math.trunc(options.sectionLimit ?? 5)));
  const region = (options.region ?? "KR").toUpperCase();
  const count = await executor.query<{ total_count: number }>(COUNT_SQL, [region]);
  const rows = await executor.query<EmsSectionRow>(SECTION_SQL, [region, sectionLimit, limit * sectionLimit]);
  const seen = new Set<string>();
  const sections = new Map<string, EmsEditorialSection>();
  for (const row of rows.rows) {
    const section = sections.get(row.slug) ?? {
      slug: row.slug,
      title: row.section_title,
      description: row.section_description,
      tracks: [],
    };
    if (seen.has(row.track_id) || section.tracks.length >= limit) continue;
    seen.add(row.track_id);
    section.tracks.push(mapEmsTrack(row));
    sections.set(row.slug, section);
  }
  return {
    totalCount: Number(count.rows[0]?.total_count ?? 0),
    sections: [...sections.values()].filter((section) => section.tracks.length > 0),
  };
}
```

Use separate count and section-row queries. The section query joins active sections, membership, active tracks, and a `JOIN LATERAL` selecting the latest matching availability event. Sort by `section.sort_order, membership.rank, track.id`. Build the response in TypeScript with a global `seenTrackIds` set and omit empty sections.

- [ ] **Step 5: Run focused tests**

Run: `npm --prefix apps/web test -- src/lib/ems/catalog.test.ts src/lib/ems/sections.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ems/catalog.ts apps/web/src/lib/ems/catalog.test.ts apps/web/src/lib/ems/sections.ts apps/web/src/lib/ems/sections.test.ts
git commit -m "feat(ems): query editorial catalog sections"
```

---

### Task 5: Public Editorial Sections API

**Files:**
- Create: `apps/web/src/app/api/ems/sections/route.ts`
- Create: `apps/web/src/app/api/ems/sections/route.test.ts`

**Interfaces:**
- Consumes: `listEmsSections` from Task 4 and `getDatabasePool()`.
- Produces: `GET /api/ems/sections?region=KR&limit=12&sectionLimit=5`.

- [ ] **Step 1: Write failing route tests**

```ts
vi.mock("@/lib/ems/sections", () => ({ listEmsSections: mocks.list }));
vi.mock("@/lib/db/pool", () => ({ getDatabasePool: () => ({}) }));

it("returns bounded editorial sections", async () => {
  mocks.list.mockResolvedValue({ totalCount: 54, sections: [] });
  const response = await GET(new Request("https://music-pie.test/api/ems/sections?region=KR&limit=12&sectionLimit=3"));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith(
    { limit: 12, region: "KR", sectionLimit: 3 },
    expect.anything(),
  );
});

it.each([
  "?region=US",
  "?limit=0",
  "?limit=13",
  "?sectionLimit=0",
  "?sectionLimit=6",
])("rejects invalid filters: %s", async (query) => {
  expect((await GET(new Request(`https://music-pie.test/api/ems/sections${query}`))).status).toBe(400);
});
```

- [ ] **Step 2: Run route test and confirm RED**

Run: `npm --prefix apps/web test -- src/app/api/ems/sections/route.test.ts`

Expected: FAIL because route is missing.

- [ ] **Step 3: Implement exact validation and error mapping**

```ts
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const region = (params.get("region") ?? "KR").trim().toUpperCase();
  const limit = Number(params.get("limit") ?? 12);
  const sectionLimit = Number(params.get("sectionLimit") ?? 5);
  if (region !== "KR" || !Number.isInteger(limit) || limit < 1 || limit > 12
    || !Number.isInteger(sectionLimit) || sectionLimit < 1 || sectionLimit > 5) {
    return Response.json({ code: "invalid_ems_section_filter" }, { status: 400 });
  }
  try {
    return Response.json(await listEmsSections({ limit, region, sectionLimit }, getDatabasePool()));
  } catch {
    return Response.json({ code: "ems_sections_unavailable" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Run route and repository tests**

Run: `npm --prefix apps/web test -- src/app/api/ems/sections/route.test.ts src/lib/ems/sections.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/ems/sections apps/web/src/lib/ems/sections.ts
git commit -m "feat(ems): expose editorial sections api"
```

---

### Task 6: Shared Editorial Rail and Browser Client

**Files:**
- Create: `apps/web/src/lib/ems/client.ts`
- Create: `apps/web/src/components/ems/editorial-section-rail.tsx`
- Create: `apps/web/src/components/ems/editorial-section-rail.test.tsx`

**Interfaces:**
- Consumes: `EmsSectionsResponse`, `TrackCard`, `useMusicSession()`.
- Produces: `fetchEmsSections(sectionLimit, signal)`, `EditorialSectionRail`.

- [ ] **Step 1: Write failing rail behavior tests**

```tsx
it("renders approved copy, links to EMS, and queues the whole section before play", async () => {
  const user = userEvent.setup();
  render(<EditorialSectionRail
    section={{ slug: "new-releases", title: "신곡 퍼레이드", description: "지금 막 도착한 새로운 음악", tracks }}
    moreHref="/ems"
  />);
  expect(screen.getByRole("heading", { name: "신곡 퍼레이드" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "EMS에서 더 보기" })).toHaveAttribute("href", "/ems");
  await user.click(screen.getByRole("button", { name: `재생 ${tracks[0].title}` }));
  expect(session.setQueue).toHaveBeenCalledWith(tracks, { id: "new-releases", type: "ems" });
  expect(session.playTrack).toHaveBeenCalledWith(tracks[0], { id: "new-releases", type: "ems" });
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `npm --prefix apps/web test -- src/components/ems/editorial-section-rail.test.tsx`

Expected: FAIL because component is missing.

- [ ] **Step 3: Add browser fetch boundary**

```ts
export async function fetchEmsSections(
  sectionLimit: number,
  signal?: AbortSignal,
): Promise<EmsSectionsResponse> {
  const params = new URLSearchParams({ limit: "12", region: "KR", sectionLimit: String(sectionLimit) });
  const response = await fetch(`/api/ems/sections?${params}`, { signal });
  if (!response.ok) throw new Error("ems_sections_failed");
  return response.json() as Promise<EmsSectionsResponse>;
}
```

- [ ] **Step 4: Implement the shared rail**

Use `<section aria-labelledby={`editorial-${section.slug}`}>`, a real `<Link>` for `moreHref`, the existing horizontal snap styles, and `TrackCard`. On play:

```tsx
const source = { id: section.slug, type: "ems" as const };
setQueue(section.tracks, source);
void playTrack(track, source);
```

Do not add custom carousel buttons until the existing native horizontal scroll proves insufficient.

- [ ] **Step 5: Run component tests**

Run: `npm --prefix apps/web test -- src/components/ems/editorial-section-rail.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ems/client.ts apps/web/src/components/ems/editorial-section-rail.tsx apps/web/src/components/ems/editorial-section-rail.test.tsx
git commit -m "feat(ems): add shared editorial section rail"
```

---

### Task 7: Replace EMS and Home Fixtures

**Files:**
- Modify: `apps/web/src/components/ems/ems-browser.tsx`
- Modify: `apps/web/src/components/ems/ems-browser.test.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.test.tsx`
- Modify: `apps/web/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `fetchEmsSections`, `EditorialSectionRail`, existing `/api/ems/catalog` search.
- Produces: Home with 3 real sections and EMS with 5 sections plus search mode.

- [ ] **Step 1: Rewrite EMS tests around editorial mode**

```tsx
it("shows editorial sections and removes unsupported platform filters", async () => {
  fetch.mockResolvedValueOnce(Response.json({ totalCount: 54, sections }));
  render(<EmsBrowser />);
  expect(await screen.findByRole("heading", { name: "신곡 퍼레이드" })).toBeInTheDocument();
  expect(screen.getByText("54")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Spotify" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Apple Music" })).not.toBeInTheDocument();
});

it("switches to debounced search and restores cached sections when cleared", async () => {
  const user = userEvent.setup();
  render(<EmsBrowser />);
  await user.type(screen.getByRole("searchbox", { name: "카탈로그 검색" }), "jazz");
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("query=jazz"), expect.anything()));
  await user.clear(screen.getByRole("searchbox", { name: "카탈로그 검색" }));
  expect(screen.getByRole("heading", { name: "신곡 퍼레이드" })).toBeInTheDocument();
});
```

Also test section error, all-empty preparation copy, zero search results, and aborted search preserving sections.

- [ ] **Step 2: Rewrite Home tests around the same API**

```tsx
it("renders the top three real EMS editorial sections without fixtures", async () => {
  fetch.mockResolvedValueOnce(Response.json({ totalCount: 54, sections: sections.slice(0, 3) }));
  renderPage();
  expect(await screen.findByRole("heading", { name: "신곡 퍼레이드" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "EMS에서 더 보기" })).toHaveLength(3);
  expect(screen.queryByText("Midnight Frequencies")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("sectionLimit=3"), expect.anything());
});
```

- [ ] **Step 3: Run UI tests and confirm RED**

Run: `npm --prefix apps/web test -- src/components/ems/ems-browser.test.tsx src/components/dashboard/music-dashboard.test.tsx src/app/page.test.tsx`

Expected: FAIL because both pages still render the old structures.

- [ ] **Step 4: Implement EMS state separation**

Keep independent state:

```ts
const [sectionsResponse, setSectionsResponse] = useState<EmsSectionsResponse | null>(null);
const [sectionState, setSectionState] = useState<"loading" | "ready" | "error">("loading");
const [query, setQuery] = useState("");
const [searchTracks, setSearchTracks] = useState<Track[]>([]);
const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
```

Initial section fetch runs once. Search effect waits 250ms, aborts the previous request, and never clears `sectionsResponse`. Empty query returns to editorial sections immediately. Use `sectionsResponse.totalCount`, not `tracks.length`, in the hero.

- [ ] **Step 5: Replace Home fixtures with fetched sections**

Keep the existing hero and remove Home's static `collections`, static `playlists`, and fixture count. The module still retains `catalog` and `Image` because GMS and `Gateway` use them. Fetch `sectionLimit=3`, render three `EditorialSectionRail` components, and show independent loading/error/preparation states below the hero.

- [ ] **Step 6: Run UI tests**

Run: `npm --prefix apps/web test -- src/components/ems/ems-browser.test.tsx src/components/ems/editorial-section-rail.test.tsx src/components/dashboard/music-dashboard.test.tsx src/app/page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ems apps/web/src/components/dashboard/music-dashboard.tsx apps/web/src/components/dashboard/music-dashboard.test.tsx apps/web/src/app/page.test.tsx
git commit -m "feat(web): curate home and ems with editorial rails"
```

---

### Task 8: Verification, Operations, and Documentation

**Files:**
- Create: `docs/changes/2026-09-22-ems-editorial-sections.md`
- Modify: `docs/overview/current-development-context.md`
- Modify only if needed: `docs/runbooks/ems-catalog-ingestion.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified migration, dry-run section counts, deployed UI only when data gates pass.

- [ ] **Step 1: Run complete local verification**

```powershell
services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run build
git diff --check
```

Expected: every command exits 0. Record exact counts; do not reuse earlier counts.

- [ ] **Step 2: Request whole-diff review**

Review from the plan base commit through current HEAD. Fix every Critical and Important finding, rerun impacted tests, then rerun the complete commands from Step 1.

- [ ] **Step 3: Apply migration on Zorin with rollback dump available**

Use the tracked migration runner and `--baseline-through=008_ems_catalog.sql`. Verify both new tables exist. Do not run a down migration on production data.

- [ ] **Step 4: Run editorial sync in dry-run mode first**

```bash
docker run --rm --network container:music-pie-web-1 \
  --env-file /home/approid/apps/music-pie/shared/secrets/ems.env \
  music-pie-ems-pipeline:editorial-sections \
  python -m ems_pipeline.cli sync-editorial-sections --dry-run
```

Gate: report `discovered`, `joined`, and projected `stored` for every slug. Do not write membership if fewer than 4 sections can store at least 6 tracks each. Do not expand the paused 1,000-track resolver run without separate user approval.

- [ ] **Step 5: Sync and deploy only after the data gate passes**

Run the same command without `--dry-run`, then query section counts and verify there are no duplicate `(section_id, track_id)` rows. Build/tag the reviewed EMS and Web images, preserve rollback tags, apply Compose without starting a continuous EMS worker, and verify:

```bash
curl -fsS http://127.0.0.1:3104/api/health/ready
curl -fsS 'http://127.0.0.1:3104/api/ems/sections?region=KR&limit=12&sectionLimit=5'
curl -fsS https://mrms.approid.team/
curl -fsS https://mrms.approid.team/ems
```

- [ ] **Step 6: Perform one bounded browser QA pass**

Capture desktop and mobile together. Verify Home top 3, EMS all sections, horizontal scroll, keyboard focus, play action, search transition, empty/error copy, no Spotify/Apple filter, and correct total count. Fix defects in one batch and confirm once.

- [ ] **Step 7: Document exact results and commit**

Record migration result, section counts, test/lint/build output, image IDs, rollback tags, public smoke, unverified items, and whether deployment was withheld by the data gate.

```bash
git add docs/changes/2026-09-22-ems-editorial-sections.md docs/overview/current-development-context.md docs/runbooks/ems-catalog-ingestion.md
git commit -m "docs(ems): record editorial sections rollout"
```
