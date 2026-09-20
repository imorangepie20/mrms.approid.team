# Auth0·TIDAL 인증과 Cloudflare Tunnel 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auth0 가입·로그인, 사용자별 TIDAL 연결 상태, PostgreSQL 저장, `mrms.approid.team` Cloudflare Tunnel 공개 경로를 제공한다.

**Architecture:** Next.js App Router의 서버 route handler가 Auth0 세션과 TIDAL authorization code 교환을 담당한다. PostgreSQL은 내부 사용자와 Auth0 `sub`, 암호화된 TIDAL 토큰·연결 상태를 사용자 단위로 보관한다. Cloudflare Tunnel은 HTTPS public hostname을 사설 웹 원본으로 전달하고 OAuth callback은 모두 해당 public URL을 사용한다.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@auth0/nextjs-auth0`, PostgreSQL, `pg`, Node.js `crypto`, Cloudflare Tunnel (`cloudflared`)

**Spec:** `docs/superpowers/specs/2026-09-20-auth0-tidal-authentication-design.md`

## Global Constraints

- 공개 웹앱 기준 URL은 `https://mrms.approid.team`이다.
- Auth0 Database Connection과 활성화된 소셜 Connection을 Auth0 Universal Login에서 함께 제공한다.
- Auth0 계정 인증과 TIDAL OAuth 권한은 분리한다.
- TIDAL OAuth에는 Authorization Code + PKCE와 검증된 `state`를 사용한다.
- 토큰, client secret, 터널 credential은 브라우저·소스 저장소·로그에 넣지 않는다.
- PostgreSQL의 사용자·TIDAL 연결 데이터는 Auth0 `sub`를 기준으로 사용자 단위로만 결합한다.
- `not_connected`, `authorization_pending`, `connected`, `reauthentication_required`, `disconnected` 상태를 사용한다.
- 실제 TIDAL endpoint, scope, token lifetime·refresh 정책을 확인하기 전에는 자동 동기화나 refresh 구현을 시작하지 않는다.
- Cloudflare Tunnel의 서비스 URL은 배포 원본의 전용 루프백 포트여야 하며 개발 서버 포트를 공개 계약으로 사용하지 않는다.

## Review Focus

- 다른 Auth0 `sub`가 현재 사용자의 TIDAL 연결 레코드를 읽거나 갱신할 수 없는지 검증한다.
- 누락·변조·만료된 TIDAL `state`와 PKCE verifier가 콜백에서 어떤 저장 변경도 일으키지 않는지 검증한다.
- TIDAL access token·refresh token·Auth0 secret·Tunnel token이 API 응답과 로그에 나타나지 않는지 검증한다.
- Auth0 세션은 있으나 TIDAL이 미연결/만료된 사용자가 EMS는 보되 MMS·GMS 개인화 조작은 못 하는지 검증한다.
- `mrms.approid.team`의 Auth0/TIDAL callback URL, Cloudflare hostname route, 서버 환경변수가 서로 일치하는지 배포 전 검증한다.

---

### Task 1: 외부 계정과 배포 구성값 확정

**Files:**
- Create: `apps/web/.env.example`
- Create: `docs/deployment/auth0-tidal-cloudflare-setup.md`
- Modify: `docs/superpowers/specs/2026-09-20-auth0-tidal-authentication-design.md`

**Interfaces:**
- Consumes: Auth0 tenant, TIDAL developer application, Cloudflare zone `approid.team`, PostgreSQL instance
- Produces: 검증된 환경변수 계약과 callback/hostname 등록 증적

- [ ] **Step 1: Auth0 Regular Web Application을 생성하고 Connection을 활성화한다**

Auth0 Dashboard에서 `music-pie-web`을 **Regular Web Application**으로 만들고 Database Connection, 선택한 소셜 Connection을 활성화한다. 다음 값을 등록한다.

```text
Allowed Callback URLs: https://mrms.approid.team/api/auth/callback
Allowed Logout URLs: https://mrms.approid.team
Allowed Web Origins: https://mrms.approid.team
```

- [ ] **Step 2: TIDAL OAuth 계약을 원본 문서로 확인한다**

TIDAL developer portal에서 다음 값을 확인해 비밀 관리 시스템에 입력한다. 권한명과 token 응답 필드는 실제 문서 값 그대로 기록한다.

```text
TIDAL_AUTHORIZE_URL
TIDAL_TOKEN_URL
TIDAL_REDIRECT_URI=https://mrms.approid.team/api/tidal/callback
TIDAL_SCOPES
token refresh 지원 여부와 rotation 규칙
```

Expected: endpoint·scope·callback·token expiry/refresh 정보가 확인되지 않으면 Task 4를 시작하지 않는다.

- [ ] **Step 3: `.env.example`에 이름만 기록한다**

```dotenv
AUTH0_SECRET=
AUTH0_BASE_URL=https://mrms.approid.team
AUTH0_ISSUER_BASE_URL=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
DATABASE_URL=
TOKEN_ENCRYPTION_KEY=
TIDAL_CLIENT_ID=
TIDAL_CLIENT_SECRET=
TIDAL_AUTHORIZE_URL=
TIDAL_TOKEN_URL=
TIDAL_REDIRECT_URI=https://mrms.approid.team/api/tidal/callback
TIDAL_SCOPES=
CLOUDFLARE_TUNNEL_TOKEN=
```

- [ ] **Step 4: Cloudflare Tunnel public hostname을 만든다**

Cloudflare Dashboard의 Networking > Tunnels에서 원격 관리 Tunnel을 만들고 Published application route를 설정한다.

```text
Hostname: mrms.approid.team
Service: http://127.0.0.1:<production-web-port>
```

`<production-web-port>`에는 systemd/서비스 구성에서 실제로 사용하는 전용 포트를 입력한다. Dashboard가 DNS record를 만들었는지 확인한다.

- [ ] **Step 5: 운영 설정 문서에 비밀값 금지와 점검 절차를 기록한다**

`docs/deployment/auth0-tidal-cloudflare-setup.md`에 Auth0 callback, TIDAL callback, tunnel route, 서버 전용 비밀값 위치, `cloudflared` health 확인법을 기록한다.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/.env.example docs/deployment/auth0-tidal-cloudflare-setup.md docs/superpowers/specs/2026-09-20-auth0-tidal-authentication-design.md
git commit -m "docs: configure Auth0 TIDAL and tunnel contracts"
```

### Task 2: PostgreSQL 연결 저장소와 암호화 모듈

**Files:**
- Create: `apps/web/src/lib/auth/connection-status.ts`
- Create: `apps/web/src/lib/auth/token-cipher.ts`
- Create: `apps/web/src/lib/db/pool.ts`
- Create: `apps/web/src/lib/db/user-connections.ts`
- Create: `apps/web/src/lib/db/migrations/001_user_tidal_connections.sql`
- Test: `apps/web/src/lib/auth/token-cipher.test.ts`
- Test: `apps/web/src/lib/db/user-connections.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, Auth0 `sub`
- Produces: `ConnectionStatus`, `upsertUserConnection`, `getUserConnection`, `markReauthenticationRequired`

- [ ] **Step 1: 암호화와 사용자 격리 테스트를 작성한다**

```ts
it("round trips an encrypted token without exposing its plaintext", () => {
  const encrypted = encryptToken("tidal-token", testKey);
  expect(encrypted).not.toContain("tidal-token");
  expect(decryptToken(encrypted, testKey)).toBe("tidal-token");
});

it("queries a connection only by the requesting Auth0 subject", async () => {
  await upsertUserConnection({ auth0Subject: "auth0|a", status: "connected", encryptedAccessToken: "a" });
  expect(await getUserConnection("auth0|b")).toBeNull();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm run test -- src/lib/auth/token-cipher.test.ts src/lib/db/user-connections.test.ts`

Expected: FAIL because the cipher and repository exports do not exist.

- [ ] **Step 3: 최소 스키마와 repository를 구현한다**

```sql
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_subject TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tidal_connections (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_connected','authorization_pending','connected','reauthentication_required','disconnected')),
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`token-cipher.ts`는 `aes-256-gcm`과 32바이트 base64 `TOKEN_ENCRYPTION_KEY`를 사용한다. `user-connections.ts`의 모든 조회·갱신은 `auth0Subject`를 유일한 사용자 조건으로 전달한다.

- [ ] **Step 4: 단위 테스트를 통과시킨다**

Run: `npm run test -- src/lib/auth/token-cipher.test.ts src/lib/db/user-connections.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/auth apps/web/src/lib/db
git commit -m "feat(auth): add encrypted TIDAL connection storage"
```

### Task 3: Auth0 사용자 인증과 서버 세션

**Files:**
- Create: `apps/web/src/app/api/auth/[auth0]/route.ts`
- Create: `apps/web/src/lib/auth/auth0.ts`
- Create: `apps/web/src/components/auth/auth-controls.tsx`
- Create: `apps/web/src/app/account/page.tsx`
- Test: `apps/web/src/components/auth/auth-controls.test.tsx`
- Test: `apps/web/src/app/account/page.test.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/navigation/app-navigation.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: Task 1 Auth0 config, Auth0 `sub`
- Produces: `/api/auth/login`, `/api/auth/signup`, `/api/auth/callback`, `/api/auth/logout`, authenticated account UI

- [ ] **Step 1: 로그인·가입 UI 테스트를 작성한다**

```tsx
it("links anonymous users to Auth0 login and sign-up", () => {
  render(<AuthControls user={null} />);
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/api/auth/login");
  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/api/auth/signup");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm run test -- src/components/auth/auth-controls.test.tsx src/app/account/page.test.tsx`

Expected: FAIL because the authentication controls and account route do not exist.

- [ ] **Step 3: Auth0 SDK와 route handler를 구현한다**

```ts
import { handleAuth, handleLogin } from "@auth0/nextjs-auth0";

export const GET = handleAuth({
  signup: handleLogin({
    authorizationParams: { screen_hint: "signup" },
    returnTo: "/onboarding",
  }),
});
```

`auth0.ts`는 서버에서 현재 세션의 `sub`를 얻는 단일 함수 `requireAuth0Subject()`를 제공한다. `layout.tsx`와 `app-navigation.tsx`는 익명 사용자에게 로그인·회원가입을, 인증 사용자에게 계정·로그아웃을 표시한다. `/account`는 이메일과 TIDAL 연결 상태만 표시하며 token 값을 렌더하지 않는다.

- [ ] **Step 4: 인증 UI 테스트를 통과시킨다**

Run: `npm run test -- src/components/auth/auth-controls.test.tsx src/app/account/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/web/package.json apps/web/package-lock.json apps/web/src/app/api/auth apps/web/src/app/account apps/web/src/lib/auth/auth0.ts apps/web/src/components/auth apps/web/src/app/layout.tsx apps/web/src/components/navigation/app-navigation.tsx
git commit -m "feat(auth): add Auth0 login and signup flow"
```

### Task 4: TIDAL Authorization Code + PKCE 연결

**Files:**
- Create: `apps/web/src/lib/tidal/oauth.ts`
- Create: `apps/web/src/app/api/tidal/connect/route.ts`
- Create: `apps/web/src/app/api/tidal/callback/route.ts`
- Create: `apps/web/src/app/api/tidal/status/route.ts`
- Test: `apps/web/src/lib/tidal/oauth.test.ts`
- Test: `apps/web/src/app/api/tidal/callback/route.test.ts`
- Modify: `apps/web/src/app/onboarding/page.tsx`
- Modify: `apps/web/src/components/onboarding/tidal-onboarding.tsx`

**Interfaces:**
- Consumes: Task 1 verified TIDAL endpoints/scopes, Task 2 repository/cipher, Task 3 `requireAuth0Subject`
- Produces: `createTidalAuthorizationRequest`, `exchangeTidalCode`, `/api/tidal/connect`, `/api/tidal/callback`, `/api/tidal/status`

- [ ] **Step 1: PKCE와 invalid callback 테스트를 작성한다**

```ts
it("builds an authorization request with S256 PKCE and state", async () => {
  const request = await createTidalAuthorizationRequest("auth0|123");
  expect(request.url).toContain("response_type=code");
  expect(request.url).toContain("code_challenge_method=S256");
  expect(request.state).toHaveLength(43);
});

it("does not persist a connection when callback state is invalid", async () => {
  const response = await handleTidalCallback({ code: "code", state: "invalid" }, sessionFor("auth0|123"));
  expect(response.status).toBe(400);
  expect(upsertUserConnection).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm run test -- src/lib/tidal/oauth.test.ts src/app/api/tidal/callback/route.test.ts`

Expected: FAIL because TIDAL OAuth helpers and callback handler do not exist.

- [ ] **Step 3: PKCE, state, callback 교환을 구현한다**

`/api/tidal/connect`는 인증된 Auth0 `sub`에 대해 cryptographically random `state`·verifier를 HttpOnly, Secure, SameSite=Lax 임시 쿠키에 저장하고 `TIDAL_AUTHORIZE_URL`로 302 redirect한다. `oauth.ts`는 SHA-256 base64url challenge를 만든다.

`/api/tidal/callback`은 cookie의 state·verifier를 검증하고, server-side `POST`로 verified `TIDAL_TOKEN_URL`에 `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`를 보낸다. 응답 token은 Task 2 cipher로 암호화해 현재 Auth0 `sub`의 연결에만 저장하고 임시 cookie를 지운다. 오류·응답 body에 token을 포함하지 않는다.

- [ ] **Step 4: 온보딩 연결 버튼을 서버 route로 전환한다**

`TidalOnboarding`의 첫 단계 버튼은 인증 사용자를 `/api/tidal/connect`로 보내고, 인증되지 않은 사용자는 `/api/auth/login?returnTo=/onboarding`으로 보낸다. status API가 `connected`일 때만 플레이리스트 선택 UI를 연다.

- [ ] **Step 5: PKCE·callback 테스트를 통과시킨다**

Run: `npm run test -- src/lib/tidal/oauth.test.ts src/app/api/tidal/callback/route.test.ts src/components/onboarding/tidal-onboarding.test.tsx`

Expected: PASS

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/lib/tidal apps/web/src/app/api/tidal apps/web/src/app/onboarding/page.tsx apps/web/src/components/onboarding
git commit -m "feat(tidal): add PKCE connection flow"
```

### Task 5: 개인화 공간 접근 제어와 운영 검증

**Files:**
- Create: `apps/web/src/lib/auth/access-policy.ts`
- Test: `apps/web/src/lib/auth/access-policy.test.ts`
- Modify: `apps/web/src/components/dashboard/music-dashboard.tsx`
- Modify: `apps/web/src/app/mms/page.tsx`
- Modify: `apps/web/src/app/gms/page.tsx`
- Modify: `docs/changes/2026-09-20-auth0-tidal-authentication-implementation.md`

**Interfaces:**
- Consumes: Task 2 `ConnectionStatus`, Task 3 Auth0 subject, Task 4 TIDAL status
- Produces: `canUsePersonalization`, user-visible reauthentication gate

- [ ] **Step 1: 접근 정책 테스트를 작성한다**

```ts
it.each(["not_connected", "authorization_pending", "reauthentication_required", "disconnected"] as const)(
  "does not allow personalization while status is %s",
  (status) => expect(canUsePersonalization({ isAuthenticated: true, connectionStatus: status })).toBe(false),
);

it("allows personalization only for an authenticated connected user", () => {
  expect(canUsePersonalization({ isAuthenticated: true, connectionStatus: "connected" })).toBe(true);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm run test -- src/lib/auth/access-policy.test.ts`

Expected: FAIL because `canUsePersonalization` does not exist.

- [ ] **Step 3: 접근 정책과 UI gate를 구현한다**

```ts
export function canUsePersonalization(input: {
  isAuthenticated: boolean;
  connectionStatus: ConnectionStatus;
}) {
  return input.isAuthenticated && input.connectionStatus === "connected";
}
```

MMS·GMS는 `connected`가 아닐 때 이유별 연결/재연결 CTA를 보인다. EMS와 공개 홈 탐색은 익명 상태에서도 유지한다. 사용자가 이미 `connected`인 경우에만 기존 추천 액션을 활성화한다.

- [ ] **Step 4: 접근 정책 테스트와 전체 검사 실행**

Run: `npm run test; npm run lint; npm run build`

Expected: 모든 테스트 통과, lint 오류 없음, `/`, `/ems`, `/gms`, `/mms`, `/onboarding`, `/search`, `/account` 빌드 성공.

- [ ] **Step 5: Cloudflare와 OAuth 운영 수동 검증**

1. `cloudflared` 상태가 Healthy인지 확인한다.
2. 공용 네트워크에서 `https://mrms.approid.team`이 HTTPS로 응답하는지 확인한다.
3. Auth0 가입·로그인 후 callback이 `https://mrms.approid.team/api/auth/callback`으로 돌아오는지 확인한다.
4. TIDAL 연결을 승인하고 `connected` 상태가 현재 사용자에게만 기록되는지 확인한다.
5. 만료 또는 연결 해제 상태에서 GMS/MMS가 재연결 CTA를 표시하고 EMS는 계속 접근 가능한지 확인한다.

- [ ] **Step 6: 변경 기록과 Commit**

```powershell
git add apps/web/src/lib/auth/access-policy.ts apps/web/src/lib/auth/access-policy.test.ts apps/web/src/components/dashboard/music-dashboard.tsx apps/web/src/app/mms/page.tsx apps/web/src/app/gms/page.tsx docs/changes/2026-09-20-auth0-tidal-authentication-implementation.md
git commit -m "feat(auth): gate personalization by TIDAL connection"
```

## Self-review

- Auth0 가입·로그인, TIDAL 분리 OAuth, PostgreSQL 사용자 격리·암호화, 공개 domain·Tunnel, 익명 EMS와 개인화 gate를 Task 1~5에 각각 배정했다.
- TIDAL endpoint/scope/refresh 정책과 Cloudflare origin 포트는 외부 계정에서 확인해야 하는 사전 조건으로 명시했고 추정값을 코드·환경 파일에 넣지 않았다.
- Review Focus의 다섯 경우는 Task 2, 4, 5 테스트 또는 Task 5 수동 운영 점검으로 연결했다.
- `TBD`, `TODO`, "later" 표현을 사용하지 않았다.
