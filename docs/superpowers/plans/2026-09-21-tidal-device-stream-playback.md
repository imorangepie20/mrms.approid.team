# TIDAL Device Stream 전체 재생 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TIDAL Device Code 토큰과 v1 `playbackinfo`를 사용해 현재 웹 플레이어에서 TIDAL 전체 트랙을 재생한다.

**Architecture:** Next.js 서버가 Device Code 인증, 암호화 토큰 저장, `playbackinfo` manifest 검증을 담당한다. 브라우저의 기존 `PlaybackEngine` 인터페이스는 유지하고 구현만 direct/HLS `HTMLAudioElement` 엔진으로 교체한다.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, PostgreSQL, Web Audio/HTMLMediaElement, hls.js, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-21-tidal-device-stream-playback-design.md`

## Global Constraints

- YouTube, 외부 TIDAL 앱·웹, 로컬 음원, 다운로드 기능을 사용하지 않는다.
- token endpoint와 `playbackinfo` 호출은 서버에서만 수행한다.
- access token, refresh token, client secret, full stream URL, manifest 원문을 로그에 남기지 않는다.
- `assetPresentation === "FULL"`이고 비암호화된 direct/HLS manifest만 성공으로 처리한다.
- `PREVIEW`, DRM, 빈 manifest, DASH는 전체 재생으로 처리하지 않는다.
- 기존 검색, 큐, 셔플, 반복, seek, 볼륨 UI 동작을 유지한다.
- 사용자 작업 트리의 기존 변경을 되돌리거나 함께 커밋하지 않는다.

## Review Focus

- token endpoint가 camelCase와 snake_case를 섞어 반환해도 필수 값을 정확히 읽는다. Task 1 parser 테스트가 보장한다.
- polling의 `authorization_pending`과 `slow_down`은 연결 실패로 저장하지 않는다. Task 1 route 테스트가 보장한다.
- scope가 응답 본문과 JWT claim에 나뉘어 있어도 `r_stream` 존재를 정확히 판정한다. Task 2 테스트가 보장한다.
- manifest가 URL, Base64 JSON, JSON 안의 URL 배열로 달라도 안전하게 해석한다. Task 2 테스트가 보장한다.
- 트랙 전환 중 이전 HLS 이벤트가 새 트랙 상태를 덮어쓰지 않는다. Task 3 reset/load 경합 테스트가 보장한다.

---

### Task 1: Device Code 인증과 토큰 저장

**Files:**
- Create: `apps/web/src/lib/tidal/device-authorization.ts`
- Create: `apps/web/src/lib/tidal/device-authorization.test.ts`
- Create: `apps/web/src/app/api/tidal/device-authorization/start/route.ts`
- Create: `apps/web/src/app/api/tidal/device-authorization/start/route.test.ts`
- Create: `apps/web/src/app/api/tidal/device-authorization/poll/route.ts`
- Create: `apps/web/src/app/api/tidal/device-authorization/poll/route.test.ts`
- Modify: `apps/web/src/lib/tidal/oauth.ts`
- Modify: `apps/web/src/lib/db/user-connections.ts`
- Modify: `apps/web/src/lib/db/user-connections.test.ts`

**Interfaces:**
- Consumes: `readTidalOAuthConfig()`, `requireAuth0Subject()`, `upsertUserConnection()`, `encryptToken()`.
- Produces: `startTidalDeviceAuthorization(fetcher?)`, `pollTidalDeviceAuthorization(deviceCode, fetcher?)`, `storeTidalDeviceToken(auth0Subject, token)`.

- [ ] **Step 1: Write failing helper and storage tests**

```ts
it("parses a device authorization response", async () => {
  const result = await startTidalDeviceAuthorization(fetchReturning({
    deviceCode: "device-1", userCode: "ABCD", verificationUri: "https://link.tidal.com",
    expiresIn: 300, interval: 5,
  }));
  expect(result).toMatchObject({ deviceCode: "device-1", userCode: "ABCD", intervalSeconds: 5 });
});

it.each(["authorization_pending", "slow_down"])("preserves %s polling state", async (code) => {
  const result = await pollTidalDeviceAuthorization("device-1", fetchReturning({ error: code }, 400));
  expect(result).toEqual({ status: code });
});

it("stores encrypted device tokens and granted scopes", async () => {
  await storeTidalDeviceToken("auth0|a", token, dependencies);
  expect(dependencies.executor.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
    "auth0|a", "connected", "encrypted-access", "encrypted-refresh", "r_usr r_stream", "123",
  ]));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd apps/web && npm test -- src/lib/tidal/device-authorization.test.ts src/lib/db/user-connections.test.ts`

Expected: FAIL because device authorization exports do not exist.

- [ ] **Step 3: Implement helpers and encrypted storage**

```ts
export type TidalDeviceAuthorization = {
  deviceCode: string; userCode: string; verificationUri: string;
  verificationUriComplete: string | null; expiresAt: Date; intervalSeconds: number;
};

export type TidalDevicePollResult =
  | { status: "authorization_pending" | "slow_down" }
  | { status: "connected"; token: TidalToken };

export async function storeTidalDeviceToken(
  auth0Subject: string,
  token: TidalToken,
  dependencies: StoreDeviceTokenDependencies = {},
) {
  const key = dependencies.encryptionKey ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is required.");
  return upsertUserConnection({
    auth0Subject,
    status: "connected",
    encryptedAccessToken: encryptToken(token.accessToken, key),
    encryptedRefreshToken: token.refreshToken ? encryptToken(token.refreshToken, key) : null,
    accessTokenExpiresAt: new Date((dependencies.now?.() ?? Date.now()) + token.expiresIn * 1000),
    scope: token.scope,
    tidalUserId: token.userId ?? null,
  }, dependencies.executor);
}
```

Device authorization URL 기본값은 `https://auth.tidal.com/v1/oauth2/device_authorization`로 추가한다. Poll 요청은 `urn:ietf:params:oauth:grant-type:device_code`를 사용한다.

- [ ] **Step 4: Write failing route tests**

```ts
it("starts device authorization for the signed-in user", async () => {
  const response = await POST();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ userCode: "ABCD" });
});

it("does not store pending polling responses", async () => {
  const response = await POST(requestWith({ deviceCode: "device-1" }));
  expect(response.status).toBe(202);
  expect(mocks.storeToken).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run route tests and verify RED**

Run: `cd apps/web && npm test -- src/app/api/tidal/device-authorization`

Expected: FAIL because route modules do not exist.

- [ ] **Step 6: Implement authenticated start and poll routes**

Routes return `401 unauthorized`, `202 authorization_pending|slow_down`, `200 connected`, and `502 tidal_device_authorization_failed`. Poll validates a non-empty `deviceCode` before provider calls.

- [ ] **Step 7: Run Task 1 tests and commit**

Run: `cd apps/web && npm test -- src/lib/tidal/device-authorization.test.ts src/lib/db/user-connections.test.ts src/app/api/tidal/device-authorization`

Expected: PASS.

```bash
git add apps/web/src/lib/tidal/device-authorization.ts apps/web/src/lib/tidal/device-authorization.test.ts apps/web/src/lib/tidal/oauth.ts apps/web/src/lib/db/user-connections.ts apps/web/src/lib/db/user-connections.test.ts apps/web/src/app/api/tidal/device-authorization
git commit -m "feat: add TIDAL device authorization"
```

### Task 2: FULL playbackinfo 서버 경계

**Files:**
- Create: `apps/web/src/lib/tidal/playback-stream.ts`
- Create: `apps/web/src/lib/tidal/playback-stream.test.ts`
- Create: `apps/web/src/app/api/tidal/tracks/[trackId]/stream/route.ts`
- Create: `apps/web/src/app/api/tidal/tracks/[trackId]/stream/route.test.ts`

**Interfaces:**
- Consumes: `getUsableTidalAccessToken(auth0Subject)` and TIDAL environment configuration.
- Produces: `resolveTidalPlaybackStream(trackId, token, options?)` and `TidalPlaybackStream`.

- [ ] **Step 1: Write failing manifest and request tests**

```ts
it("requests a FULL stream and decodes a Base64 manifest", async () => {
  const stream = await resolveTidalPlaybackStream("42", token, { fetcher });
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(
    "/tracks/42/playbackinfo?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL"
  ), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access" }) }));
  expect(stream).toMatchObject({ assetPresentation: "FULL", streamUrl: "https://audio.example/42.flac" });
});

it.each([
  ["PREVIEW", "tidal_full_playback_unavailable"],
  ["FULL_WITH_DRM", "tidal_stream_format_unsupported"],
  ["DASH", "tidal_stream_format_unsupported"],
])("rejects %s", async (_case, code) => {
  await expect(resolveTidalPlaybackStream("42", token, fixture(_case))).rejects.toMatchObject({ code });
});
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `cd apps/web && npm test -- src/lib/tidal/playback-stream.test.ts`

Expected: FAIL because playback stream module does not exist.

- [ ] **Step 3: Implement strict resolver**

```ts
export type TidalPlaybackStream = {
  assetPresentation: "FULL";
  audioQuality: string | null;
  codec: string | null;
  durationSeconds: number | null;
  manifestMimeType: string | null;
  streamUrl: string;
};

export class TidalPlaybackStreamError extends Error {
  constructor(public readonly code:
    | "tidal_stream_scope_required"
    | "tidal_full_playback_unavailable"
    | "tidal_stream_format_unsupported"
    | "tidal_playback_upstream_failed") { super(code); }
}
```

Scope는 저장된 응답 scope와 JWT `scope` claim을 합쳐 검사한다. Manifest decoder는 direct URL, Base64 JSON의 `urls[0]`, `url`, `mimeType`, `encryptionType`, `assetPresentation`을 읽는다. `trackId`는 숫자 문자열, quality는 `LOW|HIGH|LOSSLESS|HI_RES|HI_RES_LOSSLESS`만 허용한다.

- [ ] **Step 4: Write failing route contract tests**

```ts
it("returns a no-store FULL stream for an authenticated user", async () => {
  const response = await GET(request, { params: Promise.resolve({ trackId: "42" }) });
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({ assetPresentation: "FULL" });
});

it("maps missing stream scope to 409", async () => {
  mocks.resolve.mockRejectedValue(new TidalPlaybackStreamError("tidal_stream_scope_required"));
  expect((await GET(request, context)).status).toBe(409);
});
```

- [ ] **Step 5: Implement route and run Task 2 tests**

Run: `cd apps/web && npm test -- src/lib/tidal/playback-stream.test.ts src/app/api/tidal/tracks`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/tidal/playback-stream.ts apps/web/src/lib/tidal/playback-stream.test.ts apps/web/src/app/api/tidal/tracks
git commit -m "feat: resolve TIDAL full playback streams"
```

### Task 3: Direct/HLS PlaybackEngine

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Replace implementation: `apps/web/src/lib/tidal/player.ts`
- Modify: `apps/web/src/lib/tidal/player.test.ts`

**Interfaces:**
- Consumes: `GET /api/tidal/tracks/{trackId}/stream` returning `TidalPlaybackStream`.
- Produces: existing `PlaybackEngine` without call-site changes.

- [ ] **Step 1: Write failing direct playback tests**

```ts
it("loads and plays a FULL direct stream through one audio element", async () => {
  const engine = createTidalPlaybackEngine({ fetchStream, createAudio });
  await engine.load(track, source);
  await engine.play();
  expect(fetchStream).toHaveBeenCalledWith("42");
  expect(audio.src).toBe("https://audio.example/42.flac");
  expect(audio.play).toHaveBeenCalled();
});

it("ignores stale events after loading a replacement track", async () => {
  await engine.load(trackA, source);
  await engine.load(trackB, source);
  oldAudio.dispatchEvent(new Event("ended"));
  expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ended" }));
});
```

- [ ] **Step 2: Run player tests and verify RED**

Run: `cd apps/web && npm test -- src/lib/tidal/player.test.ts`

Expected: FAIL because current engine calls `@tidal-music/player` instead of the stream endpoint.

- [ ] **Step 3: Add hls.js and implement engine**

Run: `cd apps/web && npm install hls.js`

Engine dependencies become:

```ts
type EngineDependencies = {
  createAudio?: () => HTMLAudioElement;
  fetchStream?: (trackId: string) => Promise<TidalPlaybackStream>;
  createHls?: () => Hls;
};
```

Each `load()` increments a generation counter, destroys the previous HLS instance, pauses and clears the previous source, then attaches listeners for the active generation. Native HLS uses `audio.canPlayType("application/vnd.apple.mpegurl")`; other HLS uses hls.js. Direct URLs set `audio.src`.

- [ ] **Step 4: Add HLS, state, seek, volume, reset and error tests**

```ts
it("uses hls.js when native HLS is unavailable", async () => {
  audio.canPlayType = vi.fn(() => "");
  await engine.load(track, source);
  expect(hls.loadSource).toHaveBeenCalledWith("https://audio.example/42.m3u8");
  expect(hls.attachMedia).toHaveBeenCalledWith(audio);
});

it("maps media events to PlaybackEvent", async () => {
  await engine.load(track, source);
  audio.dispatchEvent(new Event("playing"));
  audio.dispatchEvent(new Event("waiting"));
  audio.dispatchEvent(new Event("ended"));
  expect(listener.mock.calls.map(([event]) => event.type)).toEqual(
    expect.arrayContaining(["state", "ended"]),
  );
});

it("clamps seek and volume", async () => {
  await engine.load(track, source);
  await engine.seek(-10);
  await engine.setVolume(130);
  expect(audio.currentTime).toBe(0);
  expect(audio.volume).toBe(1);
});

it("destroys HLS and clears the source on reset", async () => {
  await engine.load(track, source);
  await engine.reset();
  expect(hls.destroy).toHaveBeenCalled();
  expect(audio.removeAttribute).toHaveBeenCalledWith("src");
  expect(audio.load).toHaveBeenCalled();
});
```

- [ ] **Step 5: Run Task 3 tests and commit**

Run: `cd apps/web && npm test -- src/lib/tidal/player.test.ts src/providers/music-session-provider.test.tsx`

Expected: PASS.

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/tidal/player.ts apps/web/src/lib/tidal/player.test.ts
git commit -m "feat: play TIDAL full streams in browser"
```

### Task 4: Device 연결 UI와 Embed 제거

**Files:**
- Create: `apps/web/src/components/player/tidal-device-authorization.tsx`
- Create: `apps/web/src/components/player/tidal-device-authorization.test.tsx`
- Modify: `apps/web/src/components/player/persistent-player.tsx`
- Modify: `apps/web/src/components/player/persistent-player.test.tsx`
- Modify: `apps/web/src/components/search/tidal-search.tsx`
- Modify: `apps/web/src/components/search/tidal-search.test.tsx`
- Delete: `apps/web/src/components/player/tidal-embed-dialog.tsx`
- Delete: `apps/web/src/components/player/tidal-embed-dialog.test.tsx`
- Modify: `apps/web/src/lib/tidal/links.ts`
- Modify: `apps/web/src/lib/tidal/links.test.ts`

**Interfaces:**
- Consumes: Device start/poll routes and stable stream error codes.
- Produces: `TidalDeviceAuthorization` dialog and corrected player/search UI.

- [ ] **Step 1: Write failing Device Code UI test**

```tsx
it("starts authorization, shows the code, and polls until connected", async () => {
  render(<TidalDeviceAuthorization onConnected={onConnected} onClose={onClose} />);
  await user.click(screen.getByRole("button", { name: "TIDAL 재생 연결" }));
  expect(await screen.findByText("ABCD")).toBeInTheDocument();
  await waitFor(() => expect(onConnected).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `cd apps/web && npm test -- src/components/player/tidal-device-authorization.test.tsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement connection dialog**

The dialog starts only after a user click, displays verification URI and user code, polls at provider interval, increases delay on `slow_down`, stops on close/expiry, and calls `onConnected()` only for `connected`.

- [ ] **Step 4: Change player/search expectations before production edits**

```tsx
expect(screen.queryByRole("button", { name: "TIDAL 전체 재생" })).not.toBeInTheDocument();
expect(screen.queryByRole("dialog", { name: "TIDAL 플레이어" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "TIDAL 재생 연결" })).toBeInTheDocument();
```

Run: `cd apps/web && npm test -- src/components/player/persistent-player.test.tsx src/components/search/tidal-search.test.tsx`

Expected: FAIL because Embed UI still exists.

- [ ] **Step 5: Remove Embed flow and connect stable errors to Device Code UI**

Remove Embed state/import/render paths from player and search detail. When playback returns `tidal_device_authorization_required` or `tidal_stream_scope_required`, show the Device Code connection action. Keep other playback errors as alerts.

- [ ] **Step 6: Run Task 4 tests and commit**

Run: `cd apps/web && npm test -- src/components/player src/components/search/tidal-search.test.tsx src/lib/tidal/links.test.ts`

Expected: PASS.

```bash
git add apps/web/src/components/player apps/web/src/components/search/tidal-search.tsx apps/web/src/components/search/tidal-search.test.tsx apps/web/src/lib/tidal/links.ts apps/web/src/lib/tidal/links.test.ts
git commit -m "feat: connect TIDAL full playback"
```

### Task 5: 문서, 전체 검증, 실제 재생 probe

**Files:**
- Create: `docs/changes/2026-09-21-tidal-device-stream-playback.md`
- Modify: `docs/overview/current-development-context.md`

**Interfaces:**
- Consumes: Tasks 1-4 completed behavior.
- Produces: verified change record and runtime result.

- [ ] **Step 1: Write Korean change record**

Record reason, Device Code flow, `playbackinfo` validation, Embed removal, tests, live verification, unverified items, and legacy endpoint risk. Never record token or stream URL.

- [ ] **Step 2: Run full automated gates**

Run:

```bash
cd apps/web
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Restart production server and verify public UI**

Build output runs on port `44119`. Verify `https://mrms.approid.team` returns 200, Device Code dialog opens, queue/shuffle controls remain, and Embed UI is absent.

- [ ] **Step 4: Run live full-playback probe**

Complete Device Code approval with the user's TIDAL account. Play one known track, confirm provider reports `FULL`, confirm playback passes the old limitation point, seek, pause/resume, and advance to the next queue item. Do not claim full playback if any condition is not observed.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/changes/2026-09-21-tidal-device-stream-playback.md docs/overview/current-development-context.md
git commit -m "docs: record TIDAL device stream playback"
```
