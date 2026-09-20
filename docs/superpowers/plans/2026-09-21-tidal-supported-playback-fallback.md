# TIDAL 지원 재생 폴백 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 트랙과 검색 상세 컬렉션을 공식 TIDAL Embed 또는 TIDAL 페이지에서 재생할 수 있게 한다.

**Architecture:** 기존 SDK 플레이어와 큐는 유지한다. 독립 `TidalEmbedDialog`가 TIDAL ID와 종류로 공식 iframe·외부 링크를 만들며, Embed를 열기 전에 SDK를 일시 정지한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-21-tidal-supported-playback-fallback-design.md`

## Global Constraints

- 공식 `https://embed.tidal.com` 및 `https://tidal.com/browse` 경로만 사용한다.
- 스트림 manifest·segment URL을 추출·저장·재사용하지 않는다.
- 기존 큐, 셔플, 반복, 페이지 이동 유지 동작을 보존한다.
- Embed와 SDK가 동시에 재생되지 않게 Embed를 열기 전에 SDK를 일시 정지한다.

## Review Focus

- ID에 특수 문자가 있어도 URL path segment를 인코딩한다.
- 지원하지 않는 종류는 URL을 만들지 않는다.
- TIDAL ID가 없는 트랙에는 전체 재생 진입점을 표시하지 않는다.
- 일시 정지가 실패해도 Promise rejection이 UI 이벤트 밖으로 새지 않는다.
- 다이얼로그는 접근 가능한 이름, 닫기, 외부 링크를 제공한다.

---

### Task 1: 공식 TIDAL Embed 다이얼로그

**Files:**
- Create: `apps/web/src/lib/tidal/links.ts`
- Create: `apps/web/src/lib/tidal/links.test.ts`
- Create: `apps/web/src/components/player/tidal-embed-dialog.tsx`
- Create: `apps/web/src/components/player/tidal-embed-dialog.test.tsx`

**Interfaces:**
- Produces: `TidalResourceKind = "track" | "album" | "playlist"`
- Produces: `tidalEmbedUrl(kind, id): string`, `tidalBrowseUrl(kind, id): string`
- Produces: `<TidalEmbedDialog kind resourceId title onClose />`

- [ ] **Step 1: URL 테스트를 먼저 작성한다**

```ts
expect(tidalEmbedUrl("track", "track/1")).toBe("https://embed.tidal.com/tracks/track%2F1");
expect(tidalBrowseUrl("playlist", "list 1")).toBe("https://tidal.com/browse/playlist/list%201");
```

- [ ] **Step 2: URL 테스트 실패를 확인한다**

Run: `npm test -- src/lib/tidal/links.test.ts`
Expected: FAIL because `./links` does not exist.

- [ ] **Step 3: 최소 URL 구현을 추가한다**

```ts
export type TidalResourceKind = "track" | "album" | "playlist";
const plural = { album: "albums", playlist: "playlists", track: "tracks" } as const;
export const tidalEmbedUrl = (kind: TidalResourceKind, id: string) =>
  `https://embed.tidal.com/${plural[kind]}/${encodeURIComponent(id)}`;
export const tidalBrowseUrl = (kind: TidalResourceKind, id: string) =>
  `https://tidal.com/browse/${kind}/${encodeURIComponent(id)}`;
```

- [ ] **Step 4: 다이얼로그 테스트를 먼저 작성한다**

```tsx
render(<TidalEmbedDialog kind="track" resourceId="track/1" title="Track A" onClose={onClose} />);
expect(screen.getByTitle("Track A TIDAL 플레이어")).toHaveAttribute("src", "https://embed.tidal.com/tracks/track%2F1");
expect(screen.getByRole("link", { name: "TIDAL에서 열기" })).toHaveAttribute("href", "https://tidal.com/browse/track/track%2F1");
await user.click(screen.getByRole("button", { name: "TIDAL 플레이어 닫기" }));
expect(onClose).toHaveBeenCalledOnce();
```

- [ ] **Step 5: 다이얼로그 테스트 실패를 확인한다**

Run: `npm test -- src/components/player/tidal-embed-dialog.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 6: 최소 다이얼로그를 구현한다**

`role="dialog"`, `aria-modal="true"`, 닫기 버튼, `allow="encrypted-media"` iframe, `target="_blank" rel="noreferrer"` 외부 링크를 추가한다.

- [ ] **Step 7: Task 1 테스트를 통과시킨다**

Run: `npm test -- src/lib/tidal/links.test.ts src/components/player/tidal-embed-dialog.test.tsx`
Expected: PASS.

### Task 2: 전역 플레이어 연결과 중복 재생 방지

**Files:**
- Modify: `apps/web/src/providers/music-session-provider.tsx`
- Modify: `apps/web/src/providers/music-session-provider.test.tsx`
- Modify: `apps/web/src/components/player/persistent-player.tsx`
- Modify: `apps/web/src/components/player/persistent-player.test.tsx`

**Interfaces:**
- Consumes: `TidalEmbedDialog`
- Produces: `pausePlayback(): Promise<void>` on `MusicSession`

- [ ] **Step 1: 세션 일시 정지 테스트를 먼저 작성한다**

테스트 소비 컴포넌트에서 `pausePlayback`을 호출하고 `engine.pause`가 한 번 호출되는지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/providers/music-session-provider.test.tsx`
Expected: FAIL because `pausePlayback` does not exist.

- [ ] **Step 3: 세션에 최소 `pausePlayback`을 추가한다**

```ts
const pausePlayback = useCallback(async () => engine.pause(), [engine]);
```

타입, context value, memo dependencies에 같은 이름을 추가한다.

- [ ] **Step 4: 전역 플레이어 Embed 테스트를 먼저 작성한다**

현재 TIDAL 트랙 재생 후 `TIDAL 전체 재생`을 누르면 `engine.pause`가 호출되고 `Tidal 플레이어` 다이얼로그가 열리는지 검증한다.

- [ ] **Step 5: 실패를 확인한다**

Run: `npm test -- src/components/player/persistent-player.test.tsx`
Expected: FAIL because the button is absent.

- [ ] **Step 6: 전역 플레이어에 Embed 진입점을 추가한다**

`currentTrack.tidalTrackId`가 문자열일 때만 버튼을 표시한다. 클릭 시 `void pausePlayback().catch(() => undefined)` 후 다이얼로그를 연다. 닫아도 큐는 바꾸지 않는다.

- [ ] **Step 7: Task 2 테스트를 통과시킨다**

Run: `npm test -- src/providers/music-session-provider.test.tsx src/components/player/persistent-player.test.tsx`
Expected: PASS.

### Task 3: 검색 앨범·플레이리스트 연결과 전체 검증

**Files:**
- Modify: `apps/web/src/components/search/tidal-search.tsx`
- Modify: `apps/web/src/components/search/tidal-search.test.tsx`
- Create: `docs/changes/2026-09-21-tidal-supported-playback-fallback.md`
- Modify: `docs/overview/current-development-context.md`

**Interfaces:**
- Consumes: `TidalEmbedDialog`, `TidalResourceKind`
- Produces: 검색 상세의 `TIDAL 전체 재생` 진입점

- [ ] **Step 1: 검색 상세 테스트를 먼저 작성한다**

앨범·플레이리스트 상세에서 `TIDAL 전체 재생`을 누르면 각각 `albums/{id}`, `playlists/{id}` iframe이 열리는지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/components/search/tidal-search.test.tsx`
Expected: FAIL because the collection Embed button is absent.

- [ ] **Step 3: 검색 상세에 컬렉션 Embed를 연결한다**

`TidalSearch`가 선택된 컬렉션 Embed 상태를 보유한다. `CatalogDetailPanel`에 `onOpenTidal`을 전달하고 헤더에 버튼을 추가한다. 기존 `전체 재생`과 `셔플`은 변경하지 않는다.

- [ ] **Step 4: 관련 테스트를 통과시킨다**

Run: `npm test -- src/components/search/tidal-search.test.tsx src/components/player/persistent-player.test.tsx src/components/player/tidal-embed-dialog.test.tsx src/lib/tidal/links.test.ts`
Expected: PASS.

- [ ] **Step 5: 변경 기록을 작성한다**

한국어로 변경 이유, 공식 경로, 검증 결과, Embed 제어 제약, 미검증 항목을 기록한다. 현재 개발 상태에도 완료 기능과 검증 결과를 반영한다.

- [ ] **Step 6: 전체 검증을 실행한다**

Run: `npm test`
Expected: all tests pass.

Run: `npm run lint`
Expected: exit 0.

Run: `npm run build`
Expected: production build succeeds.

Run: `git diff --check`
Expected: no output.
