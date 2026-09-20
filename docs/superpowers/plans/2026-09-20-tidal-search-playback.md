# TIDAL 검색과 플레이어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TIDAL 카탈로그를 검색하고 기존 music-pie 하단·전체화면 플레이어 UI에서 실제 트랙을 재생한다.

**Architecture:** 검색은 인증된 Next.js Route Handler가 TIDAL JSON:API를 호출하고 UI에는 정규화된 결과만 반환한다. 재생은 브라우저 전용 singleton adapter가 `@tidal-music/player`를 감싸며, 서버의 playback credentials endpoint가 유효한 access token만 공식 `CredentialsProvider` 형태로 공급한다. `MusicSessionProvider`는 SDK 이벤트에서 단일 재생 상태를 만들고 기존 두 플레이어 화면이 이를 공유한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `@tidal-music/player` 0.20.1, TIDAL Web API v2, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-20-tidal-playlist-persistence-design.md`

## Global Constraints

- Plan 1의 `getUsableTidalAccessToken()`과 사용자별 TIDAL 연결 저장소를 사용한다.
- OAuth 요청 권한은 `playlists.read search.read playback user.read`다.
- TIDAL Player SDK는 Client Component에서 동적 import하고 서버 렌더링 중 실행하지 않는다.
- 브라우저 credentials 응답에는 refresh token을 포함하지 않는다.
- 기존 `PersistentPlayer`와 `FullPlayerDialog`의 레이아웃·접근성 역할은 유지한다.
- 재생 상태는 SDK 이벤트가 결정하며 UI 클릭만으로 playing 상태를 낙관적으로 바꾸지 않는다.
- 검색과 재생에서 TIDAL resource ID를 opaque string으로 유지한다.
- 전체 페이지 navigation을 피하고 내부 경로는 Next.js client navigation을 사용해 root provider를 보존한다.

## Review Focus

- 만료 직전 access token 두 요청이 동시에 refresh되어 refresh token rotation을 깨뜨리지 않아야 한다. Task 1 token lock 테스트로 고정한다.
- Player SDK module이 서버 render/test import 시 `window` 또는 `localStorage` 오류를 내지 않아야 한다. Task 2 dynamic loader 테스트로 고정한다.
- 빠르게 A→B 트랙을 선택했을 때 늦은 A load 완료가 B를 현재 곡으로 되돌리지 않아야 한다. Task 3 stale transition 테스트로 고정한다.
- 빠른 검색어 변경에서 오래 걸린 이전 응답이 최신 결과를 덮어쓰지 않아야 한다. Task 5 abort 테스트로 고정한다.
- 현재 queue에 같은 TIDAL track ID가 두 번 있어도 `referenceId`와 index로 이전·다음 위치가 정확해야 한다. Task 3 queue 테스트로 고정한다.

---

### Task 1: playback credentials endpoint

**Files:**
- Create: `apps/web/src/lib/tidal/playback-credentials.ts`
- Create: `apps/web/src/lib/tidal/playback-credentials.test.ts`
- Create: `apps/web/src/app/api/tidal/playback-credentials/route.ts`
- Create: `apps/web/src/app/api/tidal/playback-credentials/route.test.ts`
- Modify: `apps/web/src/lib/db/user-connections.ts`
- Modify: `apps/web/src/lib/db/user-connections.test.ts`

**Interfaces:**
- Consumes: Plan 1 `getUsableTidalAccessToken(auth0Subject)`
- Produces: `getPlaybackCredentials()`, GET route, SDK `CredentialsProvider` response

- [ ] **Step 1: scope·refresh-token 비노출·동시 refresh 테스트를 작성한다**

```ts
it("returns player credentials without the refresh token", async () => {
  const credentials = await getPlaybackCredentials("auth0|a", deps.connected({
    accessToken: "access",
    refreshToken: "server-only-refresh",
    scope: "playlists.read search.read playback user.read",
  }));
  expect(credentials).toEqual({
    clientId: "tidal-client",
    expires: 1_795_000_000_000,
    grantedScopes: ["playlists.read", "search.read", "playback", "user.read"],
    requestedScopes: ["playlists.read", "search.read", "playback", "user.read"],
    token: "access",
  });
  expect(credentials).not.toHaveProperty("refreshToken");
});

it("serializes refresh for the same user", async () => {
  await Promise.all([getUsableTidalAccessToken("auth0|a", deps), getUsableTidalAccessToken("auth0|a", deps)]);
  expect(deps.refresh).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test -- src/lib/tidal/playback-credentials.test.ts src/app/api/tidal/playback-credentials/route.test.ts src/lib/db/user-connections.test.ts`

Expected: FAIL because playback credentials and refresh serialization are absent.

- [ ] **Step 3: scope 검증과 credentials 변환을 구현한다**

```ts
const REQUIRED_PLAYBACK_SCOPES = ["playback"] as const;

export async function getPlaybackCredentials(auth0Subject: string) {
  const token = await getUsableTidalAccessToken(auth0Subject);
  const grantedScopes = token.scope.split(/\s+/).filter(Boolean);
  if (!REQUIRED_PLAYBACK_SCOPES.every((scope) => grantedScopes.includes(scope))) {
    throw new PlaybackCredentialsError("tidal_playback_scope_required");
  }
  return {
    clientId: readTidalOAuthConfig().clientId,
    expires: token.expiresAt.getTime(),
    grantedScopes,
    requestedScopes: readTidalOAuthConfig().scopes,
    token: token.accessToken,
  };
}
```

동시 refresh는 PostgreSQL transaction에서 해당 `tidal_connections` 행을 `FOR UPDATE`로 잠근 뒤 최신 만료 시각을 다시 확인해 한 요청만 외부 refresh를 호출하게 한다.

- [ ] **Step 4: route의 인증·오류 응답을 구현한다**

성공은 `Cache-Control: no-store`와 credentials JSON을 반환한다. 익명은 401, scope 부족은 409 `tidal_playback_scope_required`, refresh 실패는 401 `tidal_reauthentication_required`를 반환한다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm run test -- src/lib/tidal/playback-credentials.test.ts src/app/api/tidal/playback-credentials/route.test.ts src/lib/db/user-connections.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/tidal/playback-credentials.ts apps/web/src/lib/tidal/playback-credentials.test.ts apps/web/src/app/api/tidal/playback-credentials apps/web/src/lib/db/user-connections.ts apps/web/src/lib/db/user-connections.test.ts
git commit -m "feat(player): expose user playback credentials"
```

### Task 2: 브라우저 전용 TIDAL Player adapter

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Create: `apps/web/src/lib/tidal/player.ts`
- Create: `apps/web/src/lib/tidal/player.test.ts`

**Interfaces:**
- Consumes: `@tidal-music/player`, `/api/tidal/playback-credentials`
- Produces: `PlaybackEngine`, `getTidalPlaybackEngine()`, normalized playback events

- [ ] **Step 1: dependency를 고정한다**

Run: `npm install @tidal-music/player@0.20.1`

Expected: `package.json` and lockfile record `@tidal-music/player` 0.20.1.

- [ ] **Step 2: server-safe singleton·credentials provider 테스트를 작성한다**

```ts
it("does not import the SDK before initialize in a browser", () => {
  expect(sdkImporter).not.toHaveBeenCalled();
  expect(getTidalPlaybackEngine()).toBe(getTidalPlaybackEngine());
});

it("maps playback credentials to the SDK provider", async () => {
  const provider = createServerCredentialsProvider(fetchCredentials);
  await expect(provider.getCredentials()).resolves.toMatchObject({ token: "access", clientId: "tidal-client" });
});
```

- [ ] **Step 3: 테스트가 구현 부재로 실패하는지 확인한다**

Run: `npm run test -- src/lib/tidal/player.test.ts`

Expected: FAIL because `player.ts` does not exist.

- [ ] **Step 4: engine interface와 singleton을 구현한다**

```ts
export type PlaybackSource = "playlist" | "search" | "mms" | "gms";
export type PlayableTrack = Track & { tidalTrackId: string; durationSeconds: number | null };

export interface PlaybackEngine {
  initialize(): Promise<void>;
  load(track: PlayableTrack, source: { id: string; type: PlaybackSource; referenceId: string }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setNext(track: PlayableTrack | null, source: { id: string; type: PlaybackSource; referenceId: string }): Promise<void>;
  subscribe(listener: (event: PlaybackEvent) => void): () => void;
}
```

`initialize()` 안에서만 `import("@tidal-music/player")`하고 `setCredentialsProvider`, `bootstrap`, SDK event listener를 한 번 연결한다. React Strict Mode 재실행은 같은 promise를 반환한다.

- [ ] **Step 5: SDK 이벤트 변환 테스트를 통과시킨다**

`PLAYING`, `NOT_PLAYING`, `STALLED`, `IDLE`, `ended`, error 및 media element의 `timeupdate`/`durationchange`를 각각 `PlaybackEvent`로 변환하는 fixture를 검증한다.

Run: `npm run test -- src/lib/tidal/player.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/tidal/player.ts apps/web/src/lib/tidal/player.test.ts
git commit -m "feat(player): add TIDAL browser playback engine"
```

### Task 3: MusicSession을 실제 재생 상태와 queue에 연결

**Files:**
- Modify: `apps/web/src/lib/music/types.ts`
- Modify: `apps/web/src/providers/music-session-provider.tsx`
- Modify: `apps/web/src/providers/music-session-provider.test.tsx`
- Modify: `apps/web/src/components/player/persistent-player.tsx`
- Modify: `apps/web/src/components/player/persistent-player.test.tsx`
- Modify: `apps/web/src/components/player/full-player-dialog.tsx`

**Interfaces:**
- Consumes: Task 2 `PlaybackEngine`
- Produces: real `playTrack`, pause/play/seek, duplicate-safe queue navigation

- [ ] **Step 1: event-driven state와 stale load 테스트를 작성한다**

```tsx
it("does not report playing until the engine emits playing", async () => {
  await user.click(screen.getByRole("button", { name: "재생 Track A" }));
  expect(screen.getByRole("button", { name: "재생" })).toBeInTheDocument();
  engine.emit({ type: "state", state: "playing" });
  expect(screen.getByRole("button", { name: "일시 정지" })).toBeInTheDocument();
});

it("ignores a late transition from an older load", async () => {
  engine.deferLoad("a");
  await session.playTrack(trackA, source);
  await session.playTrack(trackB, source);
  engine.resolveLoad("a");
  expect(session.currentTrack?.tidalTrackId).toBe("b");
});
```

- [ ] **Step 2: 기존 낙관적 boolean 구현에서 실패하는지 확인한다**

Run: `npm run test -- src/providers/music-session-provider.test.tsx src/components/player/persistent-player.test.tsx`

Expected: FAIL because current `playTrack()` immediately sets `isPlaying` and never calls an engine.

- [ ] **Step 3: session state를 reducer로 바꾼다**

```ts
type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "stalled" | "error";
type PlaybackSessionState = {
  currentIndex: number | null;
  durationSeconds: number;
  errorCode: string | null;
  positionSeconds: number;
  queue: QueueItem[];
  status: PlaybackStatus;
};
```

각 queue item은 `referenceId = crypto.randomUUID()`를 가져 같은 TIDAL track ID 중복을 구분한다. load generation counter로 이전 Promise 완료를 무시한다.

- [ ] **Step 4: player UI를 초 단위 상태에 연결한다**

slider의 `max`는 `durationSeconds`, `value`는 `positionSeconds`로 바꾸고 `onChange`에서 engine `seek(seconds)`를 호출한다. loading/stalled는 버튼을 비활성화하지 않고 상태 레이블을 제공하며 error는 `role="alert"`로 표시한다.

- [ ] **Step 5: queue와 setNext 테스트를 추가한다**

동일 track ID 두 항목에서 다음 버튼이 index 기준으로 전진하는지, ended가 다음 항목을 load하는지, 마지막 항목은 IDLE로 끝나는지 검증한다.

Run: `npm run test -- src/providers/music-session-provider.test.tsx src/components/player/persistent-player.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/music/types.ts apps/web/src/providers apps/web/src/components/player
git commit -m "feat(player): drive the persistent player from TIDAL"
```

### Task 4: TIDAL search adapter와 routes

**Files:**
- Create: `apps/web/src/lib/tidal/search.ts`
- Create: `apps/web/src/lib/tidal/search.test.ts`
- Create: `apps/web/src/app/api/tidal/search/route.ts`
- Create: `apps/web/src/app/api/tidal/search/route.test.ts`
- Create: `apps/web/src/app/api/tidal/search/suggestions/route.ts`
- Create: `apps/web/src/app/api/tidal/search/suggestions/route.test.ts`

**Interfaces:**
- Consumes: access token, `searchResults`, `searchSuggestions` JSON:API
- Produces: `searchTidalCatalog()`, `suggestTidalSearch()`, normalized search routes

- [ ] **Step 1: trim·빈 입력·opaque ID·관계 결합 테스트를 작성한다**

```ts
it("returns no results without making a request for blank input", async () => {
  const fetcher = vi.fn();
  await expect(searchTidalCatalog("   ", credentials, fetcher)).resolves.toEqual(emptySearchResult);
  expect(fetcher).not.toHaveBeenCalled();
});

it("normalizes a playable track from included relationships", async () => {
  const result = await searchTidalCatalog("Björk", credentials, fixtureFetcher);
  expect(result.tracks[0]).toMatchObject({ tidalTrackId: "opaque-track-id", artist: "Björk", sourceType: "search" });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm run test -- src/lib/tidal/search.test.ts src/app/api/tidal/search/route.test.ts src/app/api/tidal/search/suggestions/route.test.ts`

Expected: FAIL because search modules and routes are absent.

- [ ] **Step 3: searchResults parser와 cursor를 구현한다**

```ts
export type TidalSearchResult = {
  tracks: PlayableTrack[];
  albums: SearchAlbum[];
  artists: SearchArtist[];
  next: string | null;
};

export async function searchTidalCatalog(query: string, credentials: TidalAccess, fetcher = fetch) {
  const normalized = query.trim();
  if (!normalized) return { tracks: [], albums: [], artists: [], next: null };
  const url = new URL("searchResults", credentials.apiBaseUrl + "/");
  url.searchParams.set("filter[query]", normalized);
  url.searchParams.set("countryCode", credentials.countryCode);
  url.searchParams.set("deviceType", "BROWSER");
  url.searchParams.set("systemType", "WEB");
  url.searchParams.set("include", "tracks,albums,artists");
  return parseSearchDocument(await tidalGet(url, credentials.accessToken, fetcher));
}
```

첫 응답의 `included`에서 `tracks`, `albums`, `artists`를 결합한다. track의 artist·album·cover art가 응답에 없으면 해당 track 관계 endpoint를 필요한 항목만 묶어 조회하고, 동일 resource ID는 요청 단위 map으로 중복 조회하지 않는다. parser fixture는 OAS의 JSON:API schema로 고정한다.

suggestions 요청은 `searchSuggestions`에 `filter[query]`, `countryCode`, `include=directHits`를 전달하고 `history` 관계는 사용하지 않는다.

- [ ] **Step 4: route 입력 한계를 구현한다**

검색어는 최대 200 Unicode code point, suggestions는 최소 2자로 제한한다. cursor는 TIDAL origin의 `links.next`에서 받은 값만 허용하고 임의 외부 URL은 400으로 거부한다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm run test -- src/lib/tidal/search.test.ts src/app/api/tidal/search/route.test.ts src/app/api/tidal/search/suggestions/route.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/tidal/search.ts apps/web/src/lib/tidal/search.test.ts apps/web/src/app/api/tidal/search
git commit -m "feat(search): query the TIDAL catalog"
```

### Task 5: 검색 UI와 기존 플레이어 연결

**Files:**
- Modify: `apps/web/src/app/search/page.tsx`
- Create: `apps/web/src/app/search/page.test.tsx`
- Create: `apps/web/src/components/search/tidal-search.tsx`
- Create: `apps/web/src/components/search/tidal-search.test.tsx`
- Modify: `apps/web/src/components/music/track-card.tsx`
- Modify: `apps/web/src/components/music/track-card.test.tsx`

**Interfaces:**
- Consumes: Task 4 routes, Task 3 `playTrack(track, source)`
- Produces: search input, suggestions, result tabs, direct playback

- [ ] **Step 1: abort·마지막 응답·재생 테스트를 작성한다**

```tsx
it("keeps only the latest search response", async () => {
  render(<TidalSearch />);
  await user.type(screen.getByRole("searchbox"), "ab");
  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "abc");
  resolveSearch("abc", trackC);
  resolveSearch("ab", trackB);
  expect(await screen.findByText(trackC.title)).toBeInTheDocument();
  expect(screen.queryByText(trackB.title)).not.toBeInTheDocument();
});

it("plays a search result in the persistent player", async () => {
  await user.click(await screen.findByRole("button", { name: "재생 Search Track" }));
  expect(playTrack).toHaveBeenCalledWith(expect.objectContaining({ tidalTrackId: "track-7" }), expect.objectContaining({ type: "search" }));
});
```

- [ ] **Step 2: 기존 EMS dashboard 화면에서 실패하는지 확인한다**

Run: `npm run test -- src/app/search/page.test.tsx src/components/search/tidal-search.test.tsx src/components/music/track-card.test.tsx`

Expected: FAIL because `/search` only renders `MusicDashboard` and has no TIDAL search behavior.

- [ ] **Step 3: 검색 hook과 AbortController를 구현한다**

입력 250ms debounce 후 이전 controller를 abort한다. effect cleanup에서도 abort하고, response가 현재 request sequence와 일치할 때만 state를 갱신한다.

```ts
const requestId = ++requestIdRef.current;
const response = await fetch(`/api/tidal/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
if (requestId === requestIdRef.current) setResults(await response.json());
```

- [ ] **Step 4: 결과 UI를 구현한다**

track·album·artist 탭을 semantic button과 heading으로 제공한다. track 재생은 `playTrack(track, { id: searchId, type: "search" })`를 호출하고 queue에는 현재 track 검색 결과를 순서대로 설정한다. 이미지 실패는 기존 gradient placeholder로 전환한다.

- [ ] **Step 5: UI 테스트를 통과시킨다**

Run: `npm run test -- src/app/search/page.test.tsx src/components/search/tidal-search.test.tsx src/components/music/track-card.test.tsx src/components/player/persistent-player.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/app/search apps/web/src/components/search apps/web/src/components/music/track-card.tsx apps/web/src/components/music/track-card.test.tsx
git commit -m "feat(search): play TIDAL catalog results"
```

### Task 6: navigation 지속성과 전체 검증

**Files:**
- Modify: `apps/web/src/components/navigation/app-navigation.tsx`
- Modify: `apps/web/src/components/navigation/app-navigation.test.tsx`
- Modify: `apps/web/src/app/layout.test.tsx`
- Create: `docs/changes/2026-09-20-tidal-search-playback.md`

**Interfaces:**
- Consumes: root `MusicSessionProvider`, Next.js `Link`
- Produces: client navigation 중 유지되는 playback session, 검증 기록

- [ ] **Step 1: 내부 링크와 단일 provider 테스트를 작성한다**

```tsx
it("keeps one music session provider around all route content", () => {
  render(await RootLayout({ children: <div>route content</div> }));
  expect(screen.getByTestId("music-session-root")).toContainElement(screen.getByText("route content"));
  expect(screen.getAllByLabelText("전역 음악 플레이어")).toHaveLength(1);
});
```

내부 navigation 항목이 `<a href>`가 아니라 Next.js `Link`를 사용하는지도 사용자 클릭 후 document reload 없이 검증한다.

- [ ] **Step 2: 실패 또는 기존 보장 여부를 확인한다**

Run: `npm run test -- src/components/navigation/app-navigation.test.tsx src/app/layout.test.tsx`

Expected: FAIL because `music-session-root` marker와 `전역 음악 플레이어` label이 아직 없다.

- [ ] **Step 3: 내부 링크와 provider marker를 정리한다**

모든 앱 내부 경로를 `next/link`로 통일하고 `MusicSessionProvider` 최상위 wrapper에 `data-testid="music-session-root"`를 제공한다. 외부 TIDAL 링크만 `<a>`를 유지한다.

- [ ] **Step 4: 관련 테스트를 실행한다**

Run: `npm run test -- src/lib/tidal/player.test.ts src/providers/music-session-provider.test.tsx src/components/player/persistent-player.test.tsx src/lib/tidal/search.test.ts src/components/search/tidal-search.test.tsx`

Expected: PASS

- [ ] **Step 5: 전체 정적 검증을 실행한다**

Run: `npm run test`

Expected: all Vitest files PASS

Run: `npm run lint`

Expected: exit 0

Run: `npm run build`

Expected: exit 0; playback-credentials/search routes and `/search` page build successfully.

- [ ] **Step 6: 실제 계정 브라우저 검증을 실행한다**

1. 재연결 후 `/api/tidal/status`가 `connected`를 반환하고 저장 scope에 `playlists.read search.read playback user.read`가 포함되는지 token 원문 없이 확인한다.
2. `/search`에서 두 글자 이상 검색해 track 결과와 앨범 이미지가 표시되는지 확인한다.
3. track 재생, pause, seek, previous, next, ended 자동 전환을 확인한다.
4. `/search`에서 `/mms`로 client navigation한 뒤 하단 플레이어가 같은 곡과 위치를 유지하는지 확인한다.
5. 새로고침 후 브라우저 세션이 초기화되고 오류 없이 player를 다시 초기화하는지 확인한다.

- [ ] **Step 7: 변경 기록과 Commit**

`docs/changes/2026-09-20-tidal-search-playback.md`에 구현 내용, 성공한 자동·수동 검증, 미검증 브라우저·계정 조건을 한국어로 기록한다.

```powershell
git add apps/web/src/components/navigation apps/web/src/app/layout.test.tsx docs/changes/2026-09-20-tidal-search-playback.md
git commit -m "test(player): verify persistent TIDAL playback"
```

## Self-review

- playback credentials, browser-only SDK, event-driven session, search adapter, search UI, navigation 지속성을 Task 1~6에 배정했다.
- Review Focus의 refresh 경쟁, SSR import, stale load, stale search, duplicate queue를 각 소유 task 테스트에 연결했다.
- Plan 1이 제공하는 token refresh·연결 저장소·track metadata만 소비하며 playlist import 구현과 중복하지 않는다.
- 실제 재생 가능 asset은 실제 계정 브라우저 검증으로 확인하고, unit test는 SDK boundary와 상태 전이를 결정론적으로 검증한다.
