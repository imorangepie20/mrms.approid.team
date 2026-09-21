# User Likes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검색·GMS·EMS의 트랙, 플레이리스트, 앨범, 아티스트 좋아요를 사용자별로 영구 저장하고 MMS를 네 종류의 좋아요 컬렉션으로 재구성한다.

**Architecture:** PostgreSQL의 단일 `user_likes` 테이블이 `(user, entity type, source, source id)`별 표시 스냅샷을 소유한다. 인증된 Route Handler가 idempotent 조회·upsert·삭제를 제공하고, root layout이 초기화한 전역 `LikesProvider`와 공통 `LikeButton`이 낙관적 UI 및 실패 복구를 담당한다. MMS는 DB에 가져온 TIDAL 플레이리스트를 먼저 표시한 뒤 같은 전역 상태로 네 좋아요 섹션을 렌더링하며, 좋아요 플레이리스트·앨범 상세는 기존 catalog API를 재사용한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, PostgreSQL (`pg`), Auth0, Vitest, Testing Library, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-09-21-user-likes-design.md`

## Global Constraints

- 좋아요 대상은 `track`, `playlist`, `album`, `artist` 네 종류다.
- 좋아요는 플레이리스트 가져오기, MMS 저장 트랙, GMS 추천 수락·싫어요와 별도 상태다.
- 현재 가져온 항목은 자동으로 좋아요 처리하지 않으며 기존 데이터도 삭제하지 않는다.
- 플레이리스트나 앨범 좋아요는 수록곡 좋아요를 만들지 않는다.
- 식별 키는 `(entityType, source, sourceId)`이며 TIDAL ID가 없는 EMS/GMS fixture도 `source=catalog`로 저장한다.
- 비로그인 하트 클릭은 현재 경로를 포함한 Auth0 로그인으로 이동하고 자동 좋아요하지 않는다.
- 문서와 사용자 노출 문구는 한국어로 작성한다.
- 새 외부 패키지를 추가하지 않는다.

## Review Focus

- 같은 항목을 빠르게 반복 클릭할 때 중복 요청이나 역전된 최종 상태가 생기지 않아야 한다. Task 3의 pending-key 테스트가 담당한다.
- 서로 다른 사용자가 같은 `sourceId`를 좋아요해도 조회·삭제가 섞이지 않아야 한다. Task 1의 DB 쿼리 테스트가 담당한다.
- 카드 내부 하트 클릭이 트랙 재생 또는 앨범·플레이리스트 상세 열기를 유발하지 않아야 한다. Task 4와 Task 5의 이벤트 전파 테스트가 담당한다.
- MMS에서 마지막 항목을 해제할 때 개수와 빈 상태가 즉시 일치해야 한다. Task 6의 통합 테스트가 담당한다.
- 검색 페이지의 지연 응답이 현재 검색 결과와 좋아요 스냅샷을 덮어쓰지 않아야 한다. Task 5의 기존 최신 요청 테스트와 아티스트 결과 테스트가 담당한다.

---

## File Structure

- `apps/web/src/lib/likes/types.ts`: 좋아요 식별자, 유형별 스냅샷, API 응답 타입과 입력 파서
- `apps/web/src/lib/db/user-likes.ts`: 사용자 범위 DB 조회·upsert·삭제
- `apps/web/src/lib/db/migrations/005_user_likes.sql`: 정방향 스키마
- `apps/web/src/lib/db/migrations/005_user_likes.down.sql`: rollback 스키마
- `apps/web/src/app/api/likes/route.ts`: 현재 사용자의 좋아요 목록 조회
- `apps/web/src/app/api/likes/[entityType]/[source]/[sourceId]/route.ts`: 좋아요 추가·해제
- `apps/web/src/providers/likes-provider.tsx`: 전역 좋아요 상태, 낙관적 갱신, 실패 복구
- `apps/web/src/components/music/like-button.tsx`: 재사용 가능한 접근성 하트 버튼
- `apps/web/src/components/music/track-list.tsx`: 모든 트랙 행 하트
- `apps/web/src/components/music/track-card.tsx`: 트랙 카드 하트와 GMS 추천 액션 분리
- `apps/web/src/components/dashboard/music-dashboard.tsx`: EMS/GMS source 지정과 추천 수락 문구
- `apps/web/src/lib/tidal/search.ts`: 아티스트 검색 결과 파싱
- `apps/web/src/components/search/tidal-search.tsx`: 네 유형 검색 탭·카드·하트
- `apps/web/src/components/music/mms-library.tsx`: 네 좋아요 섹션과 상세 화면
- `apps/web/src/app/mms/page.tsx`: 저장 트랙 전체 조회 제거, 가져온 플레이리스트·소속 트랙 조회와 MMS 접근 상태 전달
- `apps/web/src/app/layout.tsx`: `LikesProvider` 연결
- `docs/changes/2026-09-21-user-likes.md`: 구현·검증 기록

### Task 1: 좋아요 타입, 마이그레이션과 DB 저장소

**Files:**
- Create: `apps/web/src/lib/likes/types.ts`
- Create: `apps/web/src/lib/likes/types.test.ts`
- Create: `apps/web/src/lib/db/user-likes.ts`
- Create: `apps/web/src/lib/db/user-likes.test.ts`
- Create: `apps/web/src/lib/db/migrations/005_user_likes.sql`
- Create: `apps/web/src/lib/db/migrations/005_user_likes.down.sql`

**Interfaces:**
- Consumes: `getDatabasePool()` and the existing `QueryExecutor` shape (`query<T>(text, values)`) used by `music-library.ts`
- Produces: `LikeEntityType`, `LikeSource`, `LikeItem`, `LikeSnapshot`, `LikesResponse`, `parseLikeKey()`, `parseLikeSnapshot()`, `getUserLikes(auth0Subject, executor?)`, `upsertUserLike(auth0Subject, item, executor?)`, `deleteUserLike(auth0Subject, key, executor?)`

- [ ] **Step 1: Write failing type and parser tests**

```ts
it("accepts the four entity types and bounded display snapshots", () => {
  expect(parseLikeSnapshot("track", {
    artworkUrl: "https://resources.tidal.com/cover.jpg",
    metadata: { album: "Homogenic", durationSeconds: 300, playbackAvailable: true },
    subtitle: "Björk",
    title: "Jóga",
  })).toMatchObject({ title: "Jóga", subtitle: "Björk" });
});

it("rejects unknown types and oversized identifiers", () => {
  expect(() => parseLikeSnapshot("video", { title: "X" })).toThrow("invalid_like_type");
  expect(() => parseLikeKey("track", "tidal", "x".repeat(301))).toThrow("invalid_like_id");
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `cd apps/web; npm test -- src/lib/likes/types.test.ts`

Expected: FAIL because `types.ts` does not exist.

- [ ] **Step 3: Implement bounded discriminated types and parsers**

```ts
export const likeEntityTypes = ["track", "playlist", "album", "artist"] as const;
export type LikeEntityType = typeof likeEntityTypes[number];
export type LikeSource = "tidal" | "catalog";
export type LikeKey = { entityType: LikeEntityType; source: LikeSource; sourceId: string };
export type LikeSnapshot = {
  artworkUrl: string;
  metadata: Record<string, boolean | number | string | null>;
  subtitle: string;
  title: string;
};
export type LikeItem = LikeKey & LikeSnapshot & { createdAt: string };
export type LikesResponse = {
  albums: LikeItem[];
  artists: LikeItem[];
  counts: Record<LikeEntityType, number>;
  playlists: LikeItem[];
  tracks: LikeItem[];
};
```

`parseLikeKey()`는 허용 유형·출처와 1~300자 ID를, `parseLikeSnapshot()`은 1~300자 제목, 300자 이하 subtitle, `https:` 또는 빈 artwork URL, 유형별 허용 metadata key/value만 반환한다.

- [ ] **Step 4: Add migration SQL**

```sql
BEGIN;
CREATE TABLE user_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('track', 'playlist', 'album', 'artist')),
  source TEXT NOT NULL CHECK (source IN ('tidal', 'catalog')),
  source_id TEXT NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 300),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  artwork_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, source, source_id)
);
CREATE INDEX user_likes_user_created_idx ON user_likes (user_id, created_at DESC);
COMMIT;
```

Rollback은 `BEGIN; DROP TABLE IF EXISTS user_likes; COMMIT;`만 수행한다.

- [ ] **Step 5: Write failing DB repository tests**

```ts
it("scopes list and delete queries to the Auth0 subject", async () => {
  const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  await getUserLikes("auth0|listener-a", db);
  await deleteUserLike("auth0|listener-a", {
    entityType: "track", source: "tidal", sourceId: "42",
  }, db);
  expect(db.query.mock.calls.flatMap((call) => call[1])).toContain("auth0|listener-a");
  expect(db.query.mock.calls.map((call) => call[0]).join("\n")).toMatch(/u\.auth0_subject/);
});

it("upserts on the complete user/type/source/id identity", async () => {
  const db = { query: vi.fn().mockResolvedValue({ rows: [{
    artwork_url: "", created_at: new Date().toISOString(), entity_type: "track",
    metadata: {}, source: "tidal", source_id: "42", subtitle: "Björk", title: "Jóga",
  }] }) };
  await upsertUserLike("auth0|listener-a", {
    artworkUrl: "", entityType: "track", metadata: {}, source: "tidal",
    sourceId: "42", subtitle: "Björk", title: "Jóga",
  }, db);
  const sql = db.query.mock.calls[0][0];
  expect(sql).toMatch(/ON CONFLICT \(user_id, entity_type, source, source_id\)/);
});
```

- [ ] **Step 6: Implement DB repository**

`getUserLikes()`는 `app_users`와 join해 현재 사용자 행만 `created_at DESC`로 반환하고 snake_case DB 행을 `LikeItem`으로 변환한다. `upsertUserLike()`는 `INSERT ... SELECT u.id ... FROM app_users u WHERE u.auth0_subject = $1 ON CONFLICT ... DO UPDATE`를 사용한다. `deleteUserLike()`도 `app_users` join을 포함한 `DELETE ... USING app_users`로 작성한다.

- [ ] **Step 7: Run Task 1 tests**

Run: `cd apps/web; npm test -- src/lib/likes/types.test.ts src/lib/db/user-likes.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```powershell
git add apps/web/src/lib/likes apps/web/src/lib/db/user-likes.ts apps/web/src/lib/db/user-likes.test.ts apps/web/src/lib/db/migrations/005_user_likes.sql apps/web/src/lib/db/migrations/005_user_likes.down.sql
git commit -m "feat(likes): add persistent user like storage"
```

### Task 2: 인증된 좋아요 API

**Files:**
- Create: `apps/web/src/app/api/likes/route.ts`
- Create: `apps/web/src/app/api/likes/route.test.ts`
- Create: `apps/web/src/app/api/likes/[entityType]/[source]/[sourceId]/route.ts`
- Create: `apps/web/src/app/api/likes/[entityType]/[source]/[sourceId]/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth0Subject()`, Task 1의 parser와 DB 함수
- Produces: `GET /api/likes`, `PUT /api/likes/{entityType}/{source}/{sourceId}`, `DELETE /api/likes/{entityType}/{source}/{sourceId}`

- [ ] **Step 1: Write failing route tests**

```ts
it("returns 401 without a session", async () => {
  mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));
  const response = await GET(new Request("http://localhost/api/likes"));
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
});

it("rejects an unsupported source before touching the database", async () => {
  const response = await PUT(requestWithSnapshot(), {
    params: Promise.resolve({ entityType: "track", source: "spotify", sourceId: "42" }),
  });
  expect(response.status).toBe(400);
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("treats repeated delete as success", async () => {
  mocks.remove.mockResolvedValue(false);
  const response = await DELETE(new Request("http://localhost"), validContext);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ liked: false });
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run: `cd apps/web; npm test -- src/app/api/likes/route.test.ts 'src/app/api/likes/[entityType]/[source]/[sourceId]/route.test.ts'`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement GET route and grouping**

```ts
export async function GET() {
  let subject: string;
  try {
    subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  try {
    const items = await getUserLikes(subject);
    return Response.json(groupLikes(items));
  } catch {
    return Response.json({ code: "likes_read_failed" }, { status: 500 });
  }
}
```

`groupLikes()`는 네 배열을 항상 포함하고 `counts`를 배열 길이로 계산한다. `type` query가 있으면 parser로 검증하고 현재 사용자의 조회 결과를 해당 유형으로 필터링한다.

- [ ] **Step 4: Implement idempotent PUT and DELETE routes**

Route context의 비동기 `params`를 await하고 `decodeURIComponent` 재해석 없이 Next가 전달한 값을 parser에 넣는다. `PUT`은 JSON 크기·형식을 검증한 뒤 `{ liked: true, item }`, `DELETE`는 `{ liked: false }`를 반환한다. parser 오류는 `400`, 인증 오류는 `401`, 나머지는 내부 정보를 숨긴 `500`으로 매핑한다.

- [ ] **Step 5: Run Task 2 tests**

Run: `cd apps/web; npm test -- src/app/api/likes/route.test.ts 'src/app/api/likes/[entityType]/[source]/[sourceId]/route.test.ts'`

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add apps/web/src/app/api/likes
git commit -m "feat(likes): expose authenticated like API"
```

### Task 3: 전역 좋아요 상태와 공통 하트 버튼

**Files:**
- Create: `apps/web/src/providers/likes-provider.tsx`
- Create: `apps/web/src/providers/likes-provider.test.tsx`
- Create: `apps/web/src/components/music/like-button.tsx`
- Create: `apps/web/src/components/music/like-button.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/layout.test.tsx`

**Interfaces:**
- Consumes: Task 1 `LikeItem`, `LikeKey`, `LikeSnapshot`, Task 2 API
- Produces: `LikesProvider({ initialLikes, isAuthenticated, children })`, `useLikes()`, `LikeButton({ item, returnTo? })`

- [ ] **Step 1: Write failing provider tests for optimistic state and rollback**

```tsx
function Harness() {
  const { isLiked, isPending, toggle } = useLikes();
  const liked = isLiked(item);
  return <button
    aria-label={`${liked ? "좋아요 취소" : "좋아요"} Jóga`}
    aria-pressed={liked}
    disabled={isPending(item)}
    onClick={() => void toggle(item)}
  />;
}

function renderHarness() {
  return render(<LikesProvider initialLikes={[]} isAuthenticated><Harness /></LikesProvider>);
}

it("optimistically likes once and ignores a second click while pending", async () => {
  let resolveRequest!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; })));
  renderHarness();
  await user.click(screen.getByRole("button", { name: "좋아요 Jóga" }));
  expect(screen.getByRole("button", { name: "좋아요 취소 Jóga" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "좋아요 취소 Jóga" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  resolveRequest(Response.json({ liked: true, item }));
});

it("restores the previous state and reports an error when saving fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
  renderHarness();
  await user.click(screen.getByRole("button", { name: "좋아요 Jóga" }));
  expect(await screen.findByRole("button", { name: "좋아요 Jóga" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("alert")).toHaveTextContent("좋아요를 저장하지 못했습니다");
});
```

- [ ] **Step 2: Run provider tests and verify failure**

Run: `cd apps/web; npm test -- src/providers/likes-provider.test.tsx src/components/music/like-button.test.tsx`

Expected: FAIL because provider and button do not exist.

- [ ] **Step 3: Implement `LikesProvider`**

```ts
type LikesContextValue = {
  error: string | null;
  isAuthenticated: boolean;
  isLiked: (key: LikeKey) => boolean;
  isPending: (key: LikeKey) => boolean;
  items: LikeItem[];
  toggle: (item: LikeKey & LikeSnapshot) => Promise<void>;
};
```

초기 상태는 root layout이 전달한 `initialLikes`를 사용한다. `toggle()`은 key별 이전 배열을 보관하고 즉시 추가·제거한 다음 PUT/DELETE한다. 실패하면 정확히 그 key의 이전 상태만 복구한다. pending `Set`에 이미 key가 있으면 반환한다. 성공 응답의 item으로 낙관적 임시 item을 교체한다.

- [ ] **Step 4: Implement accessible `LikeButton`**

```tsx
<button
  aria-label={`${liked ? "좋아요 취소" : "좋아요"} ${item.title}`}
  aria-pressed={liked}
  disabled={pending}
  type="button"
  onClick={(event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      window.location.assign(`/api/auth/login?returnTo=${encodeURIComponent(returnTo ?? currentPath)}`);
      return;
    }
    void toggle(item);
  }}
>
  <HeartIcon filled={liked} />
</button>
```

- [ ] **Step 5: Load initial likes in root layout and mount provider**

`RootLayout`은 session과 `DATABASE_URL`이 있을 때 `getUserLikes(session.user.sub)`를 호출한다. `<LikesProvider initialLikes={likes} isAuthenticated={Boolean(session)}>`가 `MusicSessionProvider`, navigation, page와 player를 감싼다. DB 설정이 없는 개발·테스트 환경은 빈 배열을 사용한다.

- [ ] **Step 6: Run Task 3 and layout tests**

Run: `cd apps/web; npm test -- src/providers/likes-provider.test.tsx src/components/music/like-button.test.tsx src/app/layout.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add apps/web/src/providers/likes-provider.tsx apps/web/src/providers/likes-provider.test.tsx apps/web/src/components/music/like-button.tsx apps/web/src/components/music/like-button.test.tsx apps/web/src/app/layout.tsx apps/web/src/app/layout.test.tsx
git commit -m "feat(likes): add optimistic like controls"
```

### Task 4: 트랙 목록, EMS와 GMS 적용

**Files:**
- Modify: `apps/web/src/components/music/track-list.tsx`
- Modify: `apps/web/src/components/music/track-list.test.tsx`
- Modify: `apps/web/src/components/music/track-card.tsx`
- Modify: `apps/web/src/components/music/track-card.test.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.test.tsx`
- Modify: `apps/web/src/components/ems/ems-browser.tsx`
- Modify: `apps/web/src/components/ems/ems-browser.test.tsx`

**Interfaces:**
- Consumes: Task 3 `LikeButton`; existing `Track`, `PlaybackSource`
- Produces: `trackLikeItem(track)` 변환과 `TrackList`/`TrackCard`의 공통 하트

- [ ] **Step 1: Write failing track UI tests**

```tsx
it("renders a separate heart without playing the track", async () => {
  render(<TrackList source={{ id: "ems", type: "ems" }} tracks={[track]} />);
  await user.click(screen.getByRole("button", { name: `좋아요 ${track.title}` }));
  expect(session.playTrack).not.toHaveBeenCalled();
});

it("allows liking a playback-disabled track", () => {
  render(<TrackList source={source} tracks={[{ ...track, playbackAvailable: false, tidalTrackId: "42" }]} />);
  expect(screen.getByRole("button", { name: `좋아요 ${track.title}` })).toBeEnabled();
});
```

- [ ] **Step 2: Run track UI tests and verify failure**

Run: `cd apps/web; npm test -- src/components/music/track-list.test.tsx src/components/music/track-card.test.tsx src/components/dashboard/music-dashboard.test.tsx src/components/ems/ems-browser.test.tsx`

Expected: FAIL because likes are not rendered.

- [ ] **Step 3: Add track snapshot adapter and heart column**

```ts
export function trackLikeItem(track: Track) {
  const source = track.tidalTrackId ? "tidal" as const : "catalog" as const;
  return {
    entityType: "track" as const,
    source,
    sourceId: source === "tidal" ? track.tidalTrackId ?? track.id : track.id,
    title: track.title,
    subtitle: track.artist,
    artworkUrl: track.artworkUrl,
    metadata: {
      album: track.album,
      durationSeconds: track.durationSeconds ?? null,
      playbackAvailable: track.playbackAvailable ?? true,
    },
  };
}
```

`TrackList`의 마지막 열은 하트이며 기존 시간 열 너비와 모바일 표시를 깨지 않는다. `TrackCard`는 이미지/재생 버튼과 독립된 하트를 렌더링한다.

- [ ] **Step 4: Apply source identity to EMS and GMS**

EMS/GMS fixture는 `tidalTrackId`가 없으므로 `trackLikeItem()`에서 자동으로 `source="catalog"`가 된다. GMS의 기존 추천 버튼 `좋아요`는 `추천 수락`으로 바꾸고 하트 좋아요와 별개로 `acceptTrack()`을 호출한다. 싫어요 동작은 유지한다.

- [ ] **Step 5: Run Task 4 tests**

Run: `cd apps/web; npm test -- src/components/music/track-list.test.tsx src/components/music/track-card.test.tsx src/components/dashboard/music-dashboard.test.tsx src/components/ems/ems-browser.test.tsx`

Expected: PASS, including current-playing indicator and disabled playback regression tests.

- [ ] **Step 6: Commit Task 4**

```powershell
git add apps/web/src/components/music/track-list.tsx apps/web/src/components/music/track-list.test.tsx apps/web/src/components/music/track-card.tsx apps/web/src/components/music/track-card.test.tsx apps/web/src/components/dashboard/music-dashboard.tsx apps/web/src/components/dashboard/music-dashboard.test.tsx apps/web/src/components/ems
git commit -m "feat(likes): add hearts to EMS and GMS tracks"
```

### Task 5: 검색의 네 유형과 하트 적용

**Files:**
- Modify: `apps/web/src/lib/tidal/search.ts`
- Modify: `apps/web/src/lib/tidal/search.test.ts`
- Modify: `apps/web/src/components/search/tidal-search.tsx`
- Modify: `apps/web/src/components/search/tidal-search.test.tsx`

**Interfaces:**
- Consumes: Task 3 `LikeButton`, Task 4 `trackLikeItem`
- Produces: `SearchArtist`, `TidalSearchResult.artists`, artist top hits와 `artists` 검색 탭

- [ ] **Step 1: Extend fixtures with artists and write failing parser tests**

```ts
expect(result.artists).toEqual([{
  artworkUrl: "https://resources.tidal.com/artist.jpg",
  id: "artist-1",
  name: "Björk",
}]);
expect(result.topHits).toContainEqual(expect.objectContaining({
  id: "artist-1", kind: "artist", name: "Björk",
}));
expect(requestUrl.searchParams.get("include")).toContain("artists");
```

- [ ] **Step 2: Run search adapter test and verify failure**

Run: `cd apps/web; npm test -- src/lib/tidal/search.test.ts`

Expected: FAIL because artists are absent from the result type and parser.

- [ ] **Step 3: Parse artist search resources**

```ts
export type SearchArtist = { artworkUrl: string; id: string; name: string };
export type SearchTopHit =
  | ({ kind: "track" } & PlayableTrack)
  | ({ kind: "album" } & SearchAlbum)
  | ({ kind: "playlist" } & SearchPlaylist)
  | ({ kind: "artist" } & SearchArtist);
```

`searchResults` include에 `artists,artists.profileArt`를 추가하고 `artwork()`가 `profileArt` 관계도 읽도록 선택 인자를 받는다. 빈 결과에도 `artists: []`를 항상 포함한다.

- [ ] **Step 4: Write failing search UI tests for all four types**

```tsx
async function renderSearchResults() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/suggestions")) return Response.json({ suggestions: [] });
    return Response.json(searchFixtureWithTrackAlbumPlaylistAndArtist);
  }));
  render(<TidalSearch />);
  await user.type(screen.getByRole("searchbox"), "Björk");
  await screen.findByText("Jóga");
}

it.each([
  ["track", "Jóga"],
  ["album", "Homogenic"],
  ["playlist", "Iceland Essentials"],
  ["artist", "Björk"],
])("renders a non-nesting like button for %s results", async (_kind, title) => {
  await renderSearchResults();
  const heart = screen.getByRole("button", { name: `좋아요 ${title}` });
  await user.click(heart);
  expect(mocks.openDetail).not.toHaveBeenCalled();
  expect(mocks.playTrack).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Add artist tab/cards and likes without nested buttons**

카드·행의 outer interaction과 하트를 형제 버튼으로 배치한다. `ResultTab`에 `artists`를 추가하고 탭 순서를 `통합 결과, 트랙, 앨범, 플레이리스트, 아티스트`로 유지한다. 검색 트랙은 `tidalTrackId`가 있으므로 `trackLikeItem(track)`이 TIDAL source를 선택하고, 나머지는 각 검색 타입에서 `LikeSnapshot`으로 변환한다. 아티스트 카드는 상세 열기 없이 표시와 하트만 제공한다.

- [ ] **Step 6: Preserve stale-request protection and run Task 5 tests**

Run: `cd apps/web; npm test -- src/lib/tidal/search.test.ts src/components/search/tidal-search.test.tsx`

Expected: PASS, including existing “latest search response only” and catalog detail tests.

- [ ] **Step 7: Commit Task 5**

```powershell
git add apps/web/src/lib/tidal/search.ts apps/web/src/lib/tidal/search.test.ts apps/web/src/components/search/tidal-search.tsx apps/web/src/components/search/tidal-search.test.tsx
git commit -m "feat(search): like tracks and catalog entities"
```

### Task 6: MMS를 좋아요 컬렉션으로 재구성

**Files:**
- Modify: `apps/web/src/app/mms/page.tsx`
- Modify: `apps/web/src/app/mms/page.test.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.tsx`
- Modify: `apps/web/src/components/music/mms-library.tsx`
- Modify: `apps/web/src/components/music/mms-library.test.tsx`

**Interfaces:**
- Consumes: Task 3 `useLikes()`, Task 5 search catalog detail shape
- Produces: `MmsLibrary({ access, importedPlaylists })`; 좋아요 트랙 변환 `likeTrackToTrack(item)`; 가져온 플레이리스트와 네 좋아요 섹션

- [ ] **Step 1: Replace saved-library page tests with likes input tests**

```ts
it("keeps imported playlists without restoring the saved-track box", async () => {
  const result = await MmsPage();
  result.type(result.props);
  expect(mocks.getSavedTracks).not.toHaveBeenCalled();
  expect(mocks.getSavedPlaylists).toHaveBeenCalled();
  expect(mocks.getSavedPlaylistTracks).toHaveBeenCalled();
  expect(mocks.getSavedTracks).not.toHaveBeenCalled();
  expect(mocks.musicDashboard).toHaveBeenCalledWith(expect.objectContaining({ importedPlaylists: expect.any(Array), space: "mms" }));
});
```

- [ ] **Step 2: Write failing MMS rendering and removal tests**

```tsx
function renderMmsWithLikes(initialLikes: LikeItem[]) {
  return render(
    <LikesProvider initialLikes={initialLikes} isAuthenticated>
      <MmsLibrary access={{ connectionStatus: "connected", isAuthenticated: true }} />
    </LikesProvider>,
  );
}

it("renders four summaries and sections in the approved order", () => {
  renderMmsWithLikes([track, playlist, album, artist]);
  const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
  expect(headings).toEqual([
    expect.stringContaining("좋아요한 트랙"),
    expect.stringContaining("좋아요한 플레이리스트"),
    expect.stringContaining("좋아요한 앨범"),
    expect.stringContaining("좋아요한 아티스트"),
  ]);
  expect(screen.queryByText("저장한 트랙")).not.toBeInTheDocument();
});

it("removes the final unliked item and shows the matching empty state", async () => {
  renderMmsWithLikes([track]);
  await user.click(screen.getByRole("button", { name: `좋아요 취소 ${track.title}` }));
  expect(screen.getByText("좋아요한 트랙이 없습니다.")).toBeInTheDocument();
  expect(screen.getByTestId("liked-track-count")).toHaveTextContent("0");
});
```

- [ ] **Step 3: Change MMS server data source**

`page.tsx`에서 `getSavedTracks` 호출은 제거한다. `getSavedPlaylists`, `getSavedPlaylistTracks`는 유지해 가져온 카드와 플레이리스트별 저장 트랙을 구성한다. 좋아요는 root layout의 `LikesProvider`가 이미 초기화하므로 여기서 다시 조회하지 않는다. TIDAL connection status 조회는 기존 접근 게이트를 위해 유지한다.

- [ ] **Step 4: Implement four summary boxes and sections**

`MmsLibrary`는 가져온 플레이리스트 그리드를 첫 번째 섹션으로 유지하고, `useLikes().items`를 좋아요 표시 소스로 사용해 해제가 즉시 반영되게 한다. 가져온 카드 선택은 DB에 저장된 수록곡 상세·전체 재생·셔플을 제공한다. 좋아요 트랙을 `Track`으로 복원할 때 `source=tidal`이면 `tidalTrackId=sourceId`, catalog이면 `id=sourceId`로 둔다. 각 섹션은 항목이 없어도 독립된 빈 상태를 렌더링한다. 기존 저장 트랙 검색·정렬만 제거한다.

- [ ] **Step 5: Reuse catalog detail for liked playlists and albums**

TIDAL source 카드 선택은 `/api/tidal/catalog?type={album|playlist}&id={sourceId}`를 호출하고 기존 로딩·오류·재시도, 전체 재생·셔플 패턴을 유지한다. catalog source에는 상세 열기 버튼을 제공하지 않는다. 상세 항목의 하트를 해제하면 상세를 닫고 카드·개수를 제거한다.

- [ ] **Step 6: Run Task 6 tests**

Run: `cd apps/web; npm test -- src/app/mms/page.test.tsx src/components/music/mms-library.test.tsx src/components/dashboard/music-dashboard.test.tsx`

Expected: PASS, including imported playlist ordering·stored queue playback and liked playlist/album queue construction tests.

- [ ] **Step 7: Commit Task 6**

```powershell
git add apps/web/src/app/mms/page.tsx apps/web/src/app/mms/page.test.tsx apps/web/src/components/dashboard/music-dashboard.tsx apps/web/src/components/music/mms-library.tsx apps/web/src/components/music/mms-library.test.tsx
git commit -m "feat(mms): show the user's liked music"
```

### Task 7: 마이그레이션 적용, 전체 회귀와 문서화

**Files:**
- Create: `docs/changes/2026-09-21-user-likes.md`
- Modify: `docs/overview/current-development-context.md`

**Interfaces:**
- Consumes: Task 1~6의 완성된 기능과 테스트
- Produces: 적용된 DB 스키마, 전체 검증 결과, 다음 작업 기록

- [ ] **Step 1: Apply the forward migration to the configured database**

Run from `apps/web` after loading the same `DATABASE_URL` used by the app:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f src/lib/db/migrations/005_user_likes.sql
```

Expected: `BEGIN`, `CREATE TABLE`, `CREATE INDEX`, `COMMIT`. 비밀값이나 connection string을 출력하지 않는다.

- [ ] **Step 2: Verify the table constraints read-only**

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -c "SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'user_likes' ORDER BY ordinal_position;"
```

Expected: `user_id`, `entity_type`, `source`, `source_id`, snapshot과 timestamp 열이 존재한다.

- [ ] **Step 3: Run focused likes and UI tests**

Run: `cd apps/web; npm test -- src/lib/likes src/lib/db/user-likes.test.ts src/app/api/likes src/providers/likes-provider.test.tsx src/components/music/like-button.test.tsx src/components/music/track-list.test.tsx src/components/search/tidal-search.test.tsx src/components/music/mms-library.test.tsx src/app/mms/page.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run the full automated gates**

```powershell
cd apps/web
npm test
npm run lint
npm run build
```

Expected: all tests pass, ESLint exits 0, Next production build exits 0.

- [ ] **Step 5: Perform authenticated browser smoke checks**

1. 검색에서 트랙·앨범·플레이리스트·아티스트 하트를 각각 누른다.
2. EMS와 GMS의 track heart가 재생·추천 수락·싫어요를 실행하지 않는지 확인한다.
3. `/mms`에서 네 개 개수와 섹션 순서를 확인한다.
4. 좋아요한 트랙 재생, 앨범·플레이리스트 상세 전체 재생·셔플을 확인한다.
5. MMS에서 각 유형을 해제하고 카드, 개수, 빈 상태가 즉시 갱신되는지 확인한다.
6. 로그아웃 후 하트를 눌러 로그인으로 이동하고 returnTo가 현재 내부 경로인지 확인한다.

- [ ] **Step 6: Record only observed results**

`docs/changes/2026-09-21-user-likes.md`에 변경 이유, DB/API/UI 변경, 성공한 명령과 실제 수동 확인 결과, 미검증 항목, 다음 작업을 한국어로 기록한다. `docs/overview/current-development-context.md`에는 현재 MMS가 좋아요 컬렉션을 표시하며 가져온 라이브러리와 분리된다는 사실을 추가한다.

- [ ] **Step 7: Review the final diff for scope and secrets**

Run: `git diff --check; git status --short; git diff --stat`

Expected: whitespace 오류 없음. 비밀값, 쿠키, DB dump 없음. 요청 밖 파일은 stage하지 않는다.

- [ ] **Step 8: Commit verification docs**

```powershell
git add docs/changes/2026-09-21-user-likes.md docs/overview/current-development-context.md
git commit -m "docs(likes): record implementation and verification"
```
