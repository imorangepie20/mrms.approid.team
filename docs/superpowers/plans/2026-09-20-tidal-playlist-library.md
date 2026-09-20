# TIDAL 플레이리스트 라이브러리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 TIDAL 플레이리스트를 선택·저장하고 ISRC 기반 MusicBrainz 보강과 앨범 이미지를 제공하며 연결 해제 후에도 저장 데이터를 유지한다.

**Architecture:** Next.js Route Handler가 Auth0 사용자와 암호화된 TIDAL 연결을 확인한 뒤 TIDAL JSON:API를 호출한다. PostgreSQL은 사용자별 플레이리스트·트랙·가져오기·보강 작업을 정규화해 저장하고, MusicBrainz 호출은 DB 큐와 전역 1초 간격으로 처리한다. UI는 가져오기 완료와 보강 진행을 분리해 MMS 진입을 불필요하게 막지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, PostgreSQL, `pg`, Vitest, Testing Library, TIDAL Web API v2, MusicBrainz Web Service v2, Cover Art Archive

**Spec:** `docs/superpowers/specs/2026-09-20-tidal-playlist-persistence-design.md`

## Global Constraints

- 모든 사용자 데이터 조회·변경은 Auth0 `sub`로 확인한 단일 `app_users.id` 범위에서 수행한다.
- TIDAL resource ID는 opaque string으로 취급하고 숫자 변환이나 구조 추론을 하지 않는다.
- OAuth 기본 요청 권한은 `playlists.read search.read playback user.read`다.
- 브라우저 응답과 로그에 access token, refresh token, 외부 오류 body를 포함하지 않는다.
- 같은 사용자의 같은 TIDAL playlist·track은 upsert하고 재연결·재시도에서 중복을 만들지 않는다.
- MusicBrainz는 ISRC가 있는 트랙만 조회하며 호출 간격은 애플리케이션 전체에서 초당 1회 이하로 제한한다.
- 연결 해제는 token과 향후 동기화만 종료하고 저장한 playlist·track·보강·MMS 데이터는 유지한다.
- 문서와 사용자 메시지는 한국어로 작성하고 코드 식별자·명령·외부 필드명은 원문을 유지한다.

## Review Focus

- 다른 Auth0 사용자가 같은 TIDAL playlist/track ID를 가져와도 데이터가 서로 노출되거나 덮어써지지 않아야 한다. Task 2 repository 테스트로 고정한다.
- 같은 트랙이 한 플레이리스트에 여러 번 등장하면 각 position을 보존해야 한다. Task 2 관계 저장 테스트로 고정한다.
- playlist pagination 중 한 페이지가 실패하면 이전 완료 페이지는 유지되고 재시도로 이어갈 수 있어야 한다. Task 4 import 서비스 테스트로 고정한다.
- 하나의 ISRC가 여러 MusicBrainz recording을 반환하면 임의의 대표 recording을 저장하지 않아야 한다. Task 5 보강 테스트로 고정한다.
- 연결 해제 중 일부 SQL만 적용되는 상태가 없어야 하며 token 제거와 import pause가 한 transaction으로 완료되어야 한다. Task 7 disconnect repository 테스트로 고정한다.

---

### Task 1: OAuth token refresh 기반 만들기

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `apps/web/src/lib/tidal/oauth.ts`
- Modify: `apps/web/src/lib/tidal/oauth.test.ts`
- Modify: `apps/web/src/lib/db/user-connections.ts`
- Modify: `apps/web/src/lib/db/user-connections.test.ts`
- Create: `apps/web/src/lib/db/migrations/002_tidal_connection_runtime.sql`
- Create: `apps/web/src/lib/db/migrations/002_tidal_connection_runtime.down.sql`

**Interfaces:**
- Consumes: OAuth authorization-code token response, refresh token, `TIDAL_CLIENT_ID`, `TIDAL_TOKEN_URL`
- Produces: `refreshTidalToken()`, `getUsableTidalAccessToken(auth0Subject)`, 연결 해제 시각

- [ ] **Step 1: token refresh와 rotation 회귀 테스트를 작성한다**

```ts
it("refreshes with the stored refresh token and keeps a rotated token", async () => {
  const result = await refreshTidalToken("old-refresh", config, tokenResponse({
    access_token: "new-access",
    refresh_token: "new-refresh",
  }));
  expect(result.accessToken).toBe("new-access");
  expect(result.refreshToken).toBe("new-refresh");
});

it("keeps the old refresh token when the server does not rotate it", async () => {
  const result = await refreshTidalToken("old-refresh", config, tokenResponse({
    access_token: "new-access",
  }));
  expect(result.refreshToken).toBe("old-refresh");
});
```

- [ ] **Step 2: 테스트가 예상 이유로 실패하는지 확인한다**

Run: `npm run test -- src/lib/tidal/oauth.test.ts src/lib/db/user-connections.test.ts`

Expected: FAIL because `refreshTidalToken()` and connection refresh persistence do not exist.

- [ ] **Step 3: OAuth token 파싱과 refresh를 최소 구현한다**

```ts
export type TidalToken = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string | null;
};

export async function refreshTidalToken(
  refreshToken: string,
  config: TidalOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<TidalToken> {
  return requestToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  }), config, fetcher);
}
```

- [ ] **Step 4: 연결 repository에 token 회전 저장을 추가한다**

```sql
ALTER TABLE tidal_connections
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;
```

`getUsableTidalAccessToken()`은 만료 60초 전이면 refresh한 뒤 access/refresh token과 만료 시각을 한 번의 upsert로 저장한다. refresh 응답이 새 refresh token을 생략하면 기존 암호화 refresh token을 유지한다.

- [ ] **Step 5: 설정 scope를 확정하고 테스트를 통과시킨다**

```dotenv
TIDAL_SCOPES=playlists.read search.read playback user.read
TIDAL_API_BASE_URL=https://openapi.tidal.com/v2
TIDAL_COUNTRY_CODE=KR
MUSICBRAINZ_USER_AGENT=music-pie/0.1.0 (https://mrms.approid.team)
```

Run: `npm run test -- src/lib/tidal/oauth.test.ts src/lib/db/user-connections.test.ts src/app/api/tidal/callback/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/.env.example apps/web/src/lib/tidal/oauth.ts apps/web/src/lib/tidal/oauth.test.ts apps/web/src/lib/db/user-connections.ts apps/web/src/lib/db/user-connections.test.ts apps/web/src/lib/db/migrations/002_tidal_connection_runtime.sql apps/web/src/lib/db/migrations/002_tidal_connection_runtime.down.sql
git commit -m "feat(tidal): refresh user-scoped access tokens"
```

### Task 2: 사용자 음악 라이브러리 schema와 repository

**Files:**
- Create: `apps/web/src/lib/db/migrations/003_user_music_library.sql`
- Create: `apps/web/src/lib/db/migrations/003_user_music_library.down.sql`
- Create: `apps/web/src/lib/db/music-library.ts`
- Create: `apps/web/src/lib/db/music-library.test.ts`
- Create: `apps/web/src/lib/music/library-types.ts`

**Interfaces:**
- Consumes: `app_users.id`, TIDAL playlist/track snapshots
- Produces: `upsertPlaylistPage()`, `getSavedPlaylists()`, `createImport()`, `updateImport()`, `claimEnrichmentJob()`

- [ ] **Step 1: 사용자 격리·중복 위치·멱등 upsert 테스트를 작성한다**

```ts
it("scopes a saved playlist to its Auth0 subject", async () => {
  const db = queryExecutor([]);
  await getSavedPlaylists("auth0|b", db);
  expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/auth0_subject\s*=\s*\$1/i), ["auth0|b"]);
});

it("uses playlist position instead of track id as the relationship key", async () => {
  const db = queryExecutor([{ playlist_id: "p", track_id: "t", position: 2 }]);
  await upsertPlaylistPage(pageWithDuplicateTrackAtPositions(1, 2), db);
  expect(db.query.mock.calls.join(" ")).toMatch(/ON CONFLICT \(playlist_id, position\)/);
});
```

- [ ] **Step 2: 테스트가 schema/repository 부재로 실패하는지 확인한다**

Run: `npm run test -- src/lib/db/music-library.test.ts`

Expected: FAIL because `music-library.ts` does not exist.

- [ ] **Step 3: expand migration을 작성한다**

```sql
CREATE TABLE user_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tidal_playlist_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tidal_artwork_url TEXT,
  selected BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tidal_playlist_id)
);

CREATE TABLE music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tidal_track_id TEXT NOT NULL,
  isrc TEXT,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT NOT NULL,
  duration_ms INTEGER,
  tidal_album_id TEXT,
  tidal_artwork_url TEXT,
  mb_recording_id UUID,
  mb_release_id UUID,
  mb_release_group_id UUID,
  mb_status TEXT NOT NULL CHECK (mb_status IN ('pending','matched','not_found','ambiguous','failed','unavailable')),
  cover_art_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tidal_track_id)
);

CREATE TABLE user_playlist_tracks (
  playlist_id UUID NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id UUID NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ,
  PRIMARY KEY (playlist_id, position)
);
```

```sql
CREATE TABLE playlist_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  requested_playlist_ids TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','paused','completed','failed_retryable','failed')),
  saved_playlist_count INTEGER NOT NULL DEFAULT 0,
  saved_track_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE musicbrainz_enrichment_jobs (
  track_id UUID PRIMARY KEY REFERENCES music_tracks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE musicbrainz_rate_limits (
  service TEXT PRIMARY KEY,
  next_request_at TIMESTAMPTZ NOT NULL
);

INSERT INTO musicbrainz_rate_limits (service, next_request_at)
VALUES ('musicbrainz', '-infinity');
```

down migration은 새 table만 역참조 순서로 제거한다.

- [ ] **Step 4: repository를 transaction executor 주입 방식으로 구현한다**

```ts
export type TidalTrackSnapshot = {
  tidalTrackId: string;
  isrc: string | null;
  title: string;
  artistName: string;
  albumName: string;
  durationMs: number | null;
  tidalAlbumId: string | null;
  tidalArtworkUrl: string | null;
};

export async function upsertPlaylistPage(
  input: { auth0Subject: string; playlist: TidalPlaylistSnapshot; tracks: PositionedTrack[] },
  executor?: TransactionExecutor,
): Promise<{ playlistId: string; trackCount: number }>;
```

각 SQL은 `app_users.auth0_subject = $1`을 포함하고 track 고유 키는 `(user_id, tidal_track_id)`, 관계 키는 `(playlist_id, position)`을 사용한다.

- [ ] **Step 5: repository 테스트를 통과시킨다**

Run: `npm run test -- src/lib/db/music-library.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/db/migrations/003_user_music_library.sql apps/web/src/lib/db/migrations/003_user_music_library.down.sql apps/web/src/lib/db/music-library.ts apps/web/src/lib/db/music-library.test.ts apps/web/src/lib/music/library-types.ts
git commit -m "feat(library): persist user playlists and tracks"
```

### Task 3: TIDAL playlist JSON:API adapter

**Files:**
- Create: `apps/web/src/lib/tidal/api.ts`
- Create: `apps/web/src/lib/tidal/api.test.ts`
- Create: `apps/web/src/app/api/tidal/playlists/route.ts`
- Create: `apps/web/src/app/api/tidal/playlists/route.test.ts`

**Interfaces:**
- Consumes: user access token, country code, JSON:API documents
- Produces: `listUserPlaylists()`, `getPlaylistTrackPages()`, `GET /api/tidal/playlists`

- [ ] **Step 1: opaque ID·included 관계·cursor 테스트를 작성한다**

```ts
it("keeps opaque playlist ids and the next cursor unchanged", async () => {
  const pages = await listUserPlaylists(clientReturning(playlistDocument));
  expect(pages.items[0].id).toBe("playlist:01H-opaque");
  expect(pages.next).toBe("https://openapi.tidal.com/v2/playlists?page[cursor]=next-token");
});

it("joins track album artist and artwork from included resources", () => {
  expect(parsePlaylistItems(trackDocument).tracks[0]).toEqual(expect.objectContaining({
    tidalTrackId: "track-1",
    isrc: "USABC2300001",
    artistName: "Artist",
    albumName: "Album",
  }));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test -- src/lib/tidal/api.test.ts src/app/api/tidal/playlists/route.test.ts`

Expected: FAIL because the adapter and route are absent.

- [ ] **Step 3: JSON:API fetch와 오류 분류를 구현한다**

```ts
export class TidalApiError extends Error {
  constructor(public readonly kind: "reauthenticate" | "retryable" | "invalid_response") {
    super(kind);
  }
}

async function tidalGet(url: URL, token: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: { accept: "application/vnd.api+json", authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) throw new TidalApiError("reauthenticate");
  if (response.status === 429 || response.status >= 500) throw new TidalApiError("retryable");
  if (!response.ok) throw new TidalApiError("invalid_response");
  return response.json();
}
```

최초 playlist 요청은 `filter[owners.id]=me`, `countryCode`, `include=coverArt`를 사용하고, 다음 페이지는 `links.next` URL을 그대로 따른다. 선택한 playlist의 item 관계는 track의 albums·artists·coverArt를 결합하는 별도 요청으로 읽는다.

- [ ] **Step 4: route가 인증 사용자에게 token 없이 목록을 반환하도록 구현한다**

```ts
export async function GET() {
  const auth0Subject = await requireAuth0Subject();
  const credentials = await getUsableTidalAccessToken(auth0Subject);
  const page = await listUserPlaylists(credentials);
  return Response.json({ playlists: page.items, next: page.next });
}
```

- [ ] **Step 5: adapter와 route 테스트를 통과시킨다**

Run: `npm run test -- src/lib/tidal/api.test.ts src/app/api/tidal/playlists/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/tidal/api.ts apps/web/src/lib/tidal/api.test.ts apps/web/src/app/api/tidal/playlists
git commit -m "feat(tidal): load user playlists and tracks"
```

### Task 4: playlist import service와 진행 API

**Files:**
- Create: `apps/web/src/lib/playlists/import-playlists.ts`
- Create: `apps/web/src/lib/playlists/import-playlists.test.ts`
- Create: `apps/web/src/app/api/playlists/import/route.ts`
- Create: `apps/web/src/app/api/playlists/import/route.test.ts`
- Create: `apps/web/src/app/api/playlists/import/[importId]/route.ts`
- Create: `apps/web/src/app/api/playlists/import/[importId]/route.test.ts`

**Interfaces:**
- Consumes: Task 2 repository, Task 3 TIDAL adapter
- Produces: `startPlaylistImport()`, `getPlaylistImport()`, POST/GET import API

- [ ] **Step 1: 입력 검증·소유권·부분 실패·멱등 테스트를 작성한다**

```ts
it("rejects an empty playlist selection without calling TIDAL", async () => {
  await expect(startPlaylistImport({ auth0Subject: "auth0|a", playlistIds: [] }, deps)).rejects.toMatchObject({ code: "playlist_selection_required" });
  expect(deps.listPlaylists).not.toHaveBeenCalled();
});

it("keeps the first stored page when the second page fails", async () => {
  deps.trackPages.mockReturnValue(pages(firstPage, new TidalApiError("retryable")));
  await expect(startPlaylistImport(input, deps)).rejects.toMatchObject({ code: "tidal_retryable" });
  expect(deps.savePage).toHaveBeenCalledTimes(1);
  expect(deps.updateImport).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed_retryable" }));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test -- src/lib/playlists/import-playlists.test.ts src/app/api/playlists/import/route.test.ts`

Expected: FAIL because import service and routes are absent.

- [ ] **Step 3: service를 페이지 단위 transaction으로 구현한다**

```ts
export async function startPlaylistImport(
  input: { auth0Subject: string; playlistIds: string[] },
  dependencies: ImportDependencies = productionDependencies,
) {
  const requestedIds = [...new Set(input.playlistIds.map((id) => id.trim()).filter(Boolean))];
  if (requestedIds.length === 0) throw new ImportError("playlist_selection_required");
  const owned = await dependencies.listPlaylists(input.auth0Subject);
  if (requestedIds.some((id) => !owned.some((playlist) => playlist.id === id))) throw new ImportError("playlist_not_owned");
  return dependencies.runImport(input.auth0Subject, requestedIds);
}
```

각 페이지 저장 후 import count를 증가시키고 ISRC가 있는 새 track에는 unique `track_id` enrichment job을 만든다.

- [ ] **Step 4: POST와 status route를 구현한다**

POST는 `{ playlistIds: string[] }`만 받고 `202 { importId }`를 반환한다. status GET은 Auth0 `sub`가 소유한 import만 반환하고 다른 사용자의 UUID에는 404를 반환한다.

- [ ] **Step 5: 관련 테스트를 통과시킨다**

Run: `npm run test -- src/lib/playlists/import-playlists.test.ts src/app/api/playlists/import/route.test.ts src/app/api/playlists/import/[importId]/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/playlists apps/web/src/app/api/playlists/import
git commit -m "feat(library): import selected TIDAL playlists"
```

### Task 5: MusicBrainz enrichment와 Cover Art Archive

**Files:**
- Create: `apps/web/src/lib/musicbrainz/client.ts`
- Create: `apps/web/src/lib/musicbrainz/client.test.ts`
- Create: `apps/web/src/lib/musicbrainz/enrichment.ts`
- Create: `apps/web/src/lib/musicbrainz/enrichment.test.ts`
- Create: `apps/web/src/app/api/musicbrainz/enrich/route.ts`
- Create: `apps/web/src/app/api/musicbrainz/enrich/route.test.ts`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: pending enrichment jobs, ISRC, MusicBrainz JSON
- Produces: `lookupIsrc()`, `enrichNextTrack()`, cover art URL, POST enrichment API

- [ ] **Step 1: 0·1·복수 recording과 retry 테스트를 작성한다**

```ts
it.each([
  [[], "not_found"],
  [[recording("a")], "matched"],
  [[recording("a"), recording("b")], "ambiguous"],
])("classifies MusicBrainz recordings", (recordings, status) => {
  expect(classifyRecordings({ recordings })).toMatchObject({ status });
});

it("does not choose a recording when an ISRC has multiple MBIDs", () => {
  expect(classifyRecordings({ recordings: [recording("a"), recording("b")] }).recordingId).toBeNull();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test -- src/lib/musicbrainz/client.test.ts src/lib/musicbrainz/enrichment.test.ts`

Expected: FAIL because MusicBrainz modules are absent.

- [ ] **Step 3: client와 결정 규칙을 구현한다**

```ts
export async function lookupIsrc(isrc: string, fetcher: typeof fetch = fetch) {
  const url = new URL(`/ws/2/isrc/${encodeURIComponent(isrc)}`, "https://musicbrainz.org");
  url.searchParams.set("inc", "artist-credits+releases+release-groups");
  url.searchParams.set("fmt", "json");
  return fetcher(url, { headers: { "user-agent": requireMusicBrainzUserAgent() } });
}
```

유일한 recording만 확정하고, official release 중 정규화된 앨범명이 일치하는 후보가 하나일 때만 release/release-group을 저장한다. cover URL은 `https://coverartarchive.org/release-group/{mbid}/front-500`을 우선한다.

- [ ] **Step 4: advisory lock과 다음 호출 시각을 적용한다**

`claimEnrichmentJob()`은 `FOR UPDATE SKIP LOCKED`로 한 건을 claim한다. transaction 안에서 `pg_advisory_xact_lock(hashtext('musicbrainz-rate-limit'))`을 얻고 `next_request_at <= now()`인 경우만 호출을 허용한 뒤 다음 시각을 `now() + interval '1 second'`로 갱신한다.

- [ ] **Step 5: 이미지 host와 route를 연결한다**

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "images.unsplash.com" },
    { protocol: "https", hostname: "coverartarchive.org" },
    { protocol: "https", hostname: "archive.org" },
  ],
}
```

POST route는 한 작업만 처리하고 `{ processed, remaining }`을 반환한다.

- [ ] **Step 6: 테스트를 통과시킨다**

Run: `npm run test -- src/lib/musicbrainz/client.test.ts src/lib/musicbrainz/enrichment.test.ts src/app/api/musicbrainz/enrich/route.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/musicbrainz apps/web/src/app/api/musicbrainz apps/web/next.config.ts
git commit -m "feat(library): enrich tracks with MusicBrainz"
```

### Task 6: 실제 playlist 선택과 import 진행 UI

**Files:**
- Modify: `apps/web/src/app/onboarding/page.tsx`
- Modify: `apps/web/src/app/onboarding/page.test.tsx`
- Modify: `apps/web/src/components/onboarding/tidal-onboarding.tsx`
- Modify: `apps/web/src/components/onboarding/tidal-onboarding.test.tsx`
- Create: `apps/web/src/lib/tidal/client-api.ts`

**Interfaces:**
- Consumes: playlist list/import/status/enrichment routes
- Produces: 실제 playlist 선택, import 진행, MMS 완료 UI

- [ ] **Step 1: 실제 fetch·빈 playlist·보강 비차단 테스트를 작성한다**

```tsx
it("loads TIDAL playlists after a connected callback", async () => {
  render(<TidalOnboarding connectHref="/api/tidal/connect" />);
  expect(await screen.findByRole("checkbox", { name: /Morning Focus/ })).toBeInTheDocument();
});

it("opens MMS when import completes while enrichment remains", async () => {
  server.status({ status: "completed", trackCount: 38, enrichmentPending: 12 });
  await user.click(screen.getByRole("button", { name: "MMS 만들기" }));
  expect(await screen.findByText("MMS와 첫 추천이 준비됐어요")).toBeInTheDocument();
});
```

- [ ] **Step 2: 기존 fixture가 테스트를 실패시키는지 확인한다**

Run: `npm run test -- src/components/onboarding/tidal-onboarding.test.tsx src/app/onboarding/page.test.tsx`

Expected: FAIL because the component requires a static `playlists` prop and never calls the routes.

- [ ] **Step 3: 작은 browser API client와 상태 hook을 구현한다**

```ts
export async function fetchTidalPlaylists(signal?: AbortSignal): Promise<TidalPlaylistSummary[]> {
  const response = await fetch("/api/tidal/playlists", { signal });
  if (!response.ok) throw new Error("tidal_playlist_load_failed");
  return ((await response.json()) as { playlists: TidalPlaylistSummary[] }).playlists;
}
```

`TidalOnboarding`은 connected 상태에서 목록을 fetch하고 import 시작 후 status를 polling한다. component unmount 시 timer와 fetch를 취소한다.

- [ ] **Step 4: fixture와 메모리 MMS 초기화를 제거한다**

`onboarding/page.tsx`의 `tidalPlaylists` 상수와 `initializeMms(initialTrackIds)` 변환을 제거한다. import `completed`의 저장 track count를 성공 기준으로 사용한다.

- [ ] **Step 5: UI 테스트를 통과시킨다**

Run: `npm run test -- src/components/onboarding/tidal-onboarding.test.tsx src/app/onboarding/page.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/app/onboarding apps/web/src/components/onboarding apps/web/src/lib/tidal/client-api.ts
git commit -m "feat(onboarding): import real TIDAL playlists"
```

### Task 7: 연결 해제와 보존 UI

**Files:**
- Modify: `apps/web/src/lib/db/music-library.ts`
- Modify: `apps/web/src/lib/db/music-library.test.ts`
- Create: `apps/web/src/app/api/tidal/disconnect/route.ts`
- Create: `apps/web/src/app/api/tidal/disconnect/route.test.ts`
- Modify: `apps/web/src/app/account/page.tsx`
- Modify: `apps/web/src/app/account/page.test.tsx`
- Create: `apps/web/src/components/account/tidal-connection-actions.tsx`
- Create: `apps/web/src/components/account/tidal-connection-actions.test.tsx`

**Interfaces:**
- Consumes: current Auth0 subject
- Produces: `disconnectTidal()`, idempotent POST route, retained counts UI

- [ ] **Step 1: transaction 보존 테스트를 작성한다**

```ts
it("clears tokens and pauses TIDAL imports without deleting saved music", async () => {
  const db = transactionExecutor();
  const result = await disconnectTidal("auth0|a", db);
  expect(result).toEqual({ playlistCount: 3, status: "disconnected", trackCount: 80 });
  expect(db.sql).toMatch(/encrypted_access_token = NULL/);
  expect(db.sql).toMatch(/status = 'paused'/);
  expect(db.sql).not.toMatch(/DELETE FROM (user_playlists|music_tracks)/);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test -- src/lib/db/music-library.test.ts src/app/api/tidal/disconnect/route.test.ts src/components/account/tidal-connection-actions.test.tsx`

Expected: FAIL because disconnect behavior and UI are absent.

- [ ] **Step 3: 연결 해제 transaction을 구현한다**

```sql
UPDATE tidal_connections AS connection
SET status = 'disconnected',
    encrypted_access_token = NULL,
    encrypted_refresh_token = NULL,
    access_token_expires_at = NULL,
    scope = NULL,
    disconnected_at = now(),
    updated_at = now()
FROM app_users AS app_user
WHERE app_user.auth0_subject = $1
  AND connection.user_id = app_user.id;
```

`disconnectTidal()`은 `BEGIN` 후 token/scope/expiry를 null로 바꾸고 running/pending TIDAL import를 `paused`로 바꾸며 retained counts를 조회한 뒤 `COMMIT`한다. 이미 disconnected여도 같은 최종 응답을 반환한다.

- [ ] **Step 4: route와 확인 UI를 구현한다**

```tsx
<p id="disconnect-description">저장한 음악과 MMS는 유지되고 이후 TIDAL 동기화만 중단됩니다.</p>
<button aria-describedby="disconnect-description" type="button" onClick={disconnect}>TIDAL 연결 해제</button>
```

- [ ] **Step 5: 관련 테스트와 전체 검증을 실행한다**

Run: `npm run test -- src/lib/db/music-library.test.ts src/app/api/tidal/disconnect/route.test.ts src/components/account/tidal-connection-actions.test.tsx src/app/account/page.test.tsx`

Expected: PASS

Run: `npm run test`

Expected: all Vitest files PASS

Run: `npm run lint`

Expected: exit 0

Run: `npm run build`

Expected: exit 0 and playlist/import/enrichment/disconnect routes are listed.

- [ ] **Step 6: 변경 기록과 Commit**

`docs/changes/2026-09-20-tidal-playlist-library.md`에 변경 이유, schema, API, 검증 성공 명령, 실제 계정 미검증 항목, 다음 작업을 한국어로 기록한다.

```powershell
git add apps/web/src/lib/db apps/web/src/app/api/tidal/disconnect apps/web/src/app/account apps/web/src/components/account docs/changes/2026-09-20-tidal-playlist-library.md
git commit -m "feat(tidal): retain library after disconnect"
```

## Self-review

- playlist 선택·저장, 사용자 격리, pagination, ISRC/MusicBrainz, 이미지, 연결 해제 후 유지 요구를 Task 1~7에 배정했다.
- Review Focus의 다섯 실패 조건은 Task 2, 4, 5, 7의 구체 테스트에 연결했다.
- Plan 2가 소비할 `getUsableTidalAccessToken`, `PlayableTrack` 기반 track metadata와 OAuth scope를 먼저 생산한다.
- 실제 외부 응답 검증 전에도 unit fixture로 parser와 오류 분류를 고정하고, 실제 계정 검증은 마지막 검증 항목으로 분리했다.
