# Zorin OS Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows에서 개발하는 `music-pie`를 Zorin OS의 격리된 Docker Compose stack으로 배포하고, 현재 PostgreSQL 데이터 전체와 공개 `mrms.approid.team` 트래픽을 안전하게 이전한다.

**Architecture:** Next.js 앱은 standalone production image로 실행하고 PostgreSQL 16.15 및 기존 Cloudflare Tunnel connector와 전용 Compose project를 구성한다. Windows 원본의 custom-format DB backup을 Zorin 전용 volume에 복원한 뒤 row count와 실제 사용자 흐름을 검증하고, Windows connector를 중지한 상태에서 Zorin connector만 시작한다.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, TypeScript, Vitest, PostgreSQL 16.15, Docker 29.8.1, Docker Compose 5.5.1, Cloudflare Tunnel, Bash, PowerShell

**Spec:** `docs/superpowers/specs/2026-09-22-zorin-production-deployment-design.md`

## Global Constraints

- 개발과 자동화 검증은 Windows worktree에서 수행하고 실제 사용자 확인은 Zorin 배포 후 수행한다.
- 서버 경로는 `/home/approid/apps/music-pie`, SSH 대상은 `approid@192.168.219.174`다.
- Web host binding은 `127.0.0.1:3104`, PostgreSQL은 host port를 열지 않는다.
- Compose project, container, network, volume은 모두 `music-pie` prefix로 격리한다.
- 공개 origin과 Auth0·TIDAL callback은 `https://mrms.approid.team`을 유지한다.
- `TOKEN_ENCRYPTION_KEY`를 포함한 운영 비밀값은 Git, image layer, 로그, 명령 출력에 노출하지 않는다.
- 원본과 대상이 동시에 쓰기를 받지 않도록 Windows Tunnel과 Web을 중지한 뒤 최종 dump를 만든다.
- Windows Web, PostgreSQL volume, Tunnel 설정은 Zorin 안정화 전까지 삭제하지 않는다.
- `docker compose down -v`, `docker volume prune`, `docker system prune --volumes`를 실행하지 않는다.

## Review Focus

- `TOKEN_ENCRYPTION_KEY` 또는 필수 secret이 누락되면 container 시작 전에 명확히 실패해야 한다. Task 4의 secret 검사 테스트로 고정한다.
- 기존 migration 파일 checksum이 기록값과 다르면 새 migration을 실행하지 않아야 한다. Task 3의 migration planner 테스트로 고정한다.
- `3104` 또는 `music-pie-*` Docker 자원이 이미 다른 소유자로 사용 중이면 staging을 중단해야 한다. Task 5의 preflight 테스트와 Task 7의 서버 점검으로 고정한다.
- dump 전송·restore 또는 row count 비교가 실패하면 공개 Tunnel을 전환하지 않아야 한다. Task 6의 검증 스크립트 테스트와 Task 8의 cutover gate로 고정한다.
- Windows와 Zorin connector가 동시에 실행되어 서로 다른 DB로 쓰기가 분기되면 안 된다. Task 8에서 Windows connector 종료와 Zorin connector 단일 실행을 전환 전후에 확인한다.

---

## File Map

- `apps/web/src/app/api/health/live/route.ts`: 프로세스 liveness 응답
- `apps/web/src/app/api/health/ready/route.ts`: PostgreSQL readiness 응답
- `apps/web/src/lib/health/readiness.ts`: DB probe와 안전한 readiness 결과
- `apps/web/scripts/migrate.mjs`: migration checksum, baseline, pending migration 적용
- `apps/web/Dockerfile`: build/runtime 분리 Next.js standalone image
- `apps/web/next.config.ts`: standalone output 활성화
- `.dockerignore`: secret·로컬 산출물의 image context 유입 차단
- `infra/compose.zorin.yml`: music-pie 전용 PostgreSQL, Web, Tunnel, migration service
- `infra/secrets/*.env.example`: 값이 아닌 key contract
- `infra/scripts/check-secrets.sh`: secret mode, 필수 key, placeholder 검사
- `infra/scripts/preflight-zorin.sh`: port와 Docker 자원 충돌 검사
- `infra/scripts/verify-deployment.sh`: local/public HTTP smoke와 container health 검사
- `infra/scripts/compare-row-counts.mjs`: 원본·대상 count manifest 비교
- `docs/deployment/zorin-production-runbook.md`: staging, dump/restore, cutover, rollback 명령
- `docs/changes/2026-09-22-zorin-production-deployment.md`: 실제 변경과 검증 결과
- `docs/overview/current-development-context.md`: 최신 배포 상태와 다음 작업

### Task 1: Add Explicit Liveness and Readiness Endpoints

**Files:**
- Create: `apps/web/src/lib/health/readiness.ts`
- Create: `apps/web/src/lib/health/readiness.test.ts`
- Create: `apps/web/src/app/api/health/live/route.ts`
- Create: `apps/web/src/app/api/health/live/route.test.ts`
- Create: `apps/web/src/app/api/health/ready/route.ts`
- Create: `apps/web/src/app/api/health/ready/route.test.ts`

**Interfaces:**
- Consumes: `getDatabasePool()` from `apps/web/src/lib/db/pool.ts`
- Produces: `checkDatabaseReadiness(query?): Promise<boolean>`, `GET /api/health/live`, `GET /api/health/ready`

- [ ] **Step 1: Write readiness unit tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { checkDatabaseReadiness } from "./readiness";

describe("checkDatabaseReadiness", () => {
  it("returns true when SELECT 1 succeeds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] });
    await expect(checkDatabaseReadiness(query)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith("SELECT 1 AS ok");
  });

  it("returns false without exposing the database error", async () => {
    const query = vi.fn().mockRejectedValue(new Error("secret host"));
    await expect(checkDatabaseReadiness(query)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the readiness test and verify it fails**

Run: `npm test -- src/lib/health/readiness.test.ts`

Expected: FAIL because `./readiness` does not exist.

- [ ] **Step 3: Implement the DB readiness probe**

```ts
import { getDatabasePool } from "@/lib/db/pool";

type ReadinessQuery = (text: string) => Promise<unknown>;

export async function checkDatabaseReadiness(
  query: ReadinessQuery = (text) => getDatabasePool().query(text),
) {
  try {
    await query("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Write route tests for exact public responses**

Test `live` returns HTTP 200 and `{ "status": "ok" }`. Mock `checkDatabaseReadiness` so `ready` returns HTTP 200 with `{ "status": "ready" }` on success and HTTP 503 with `{ "status": "unavailable" }` on failure. Assert neither response contains an exception message, DB host, or stack trace.

- [ ] **Step 5: Run route tests and verify they fail**

Run: `npm test -- src/app/api/health/live/route.test.ts src/app/api/health/ready/route.test.ts`

Expected: FAIL because both routes are missing.

- [ ] **Step 6: Implement the routes**

```ts
// live/route.ts
export async function GET() {
  return Response.json({ status: "ok" });
}
```

```ts
// ready/route.ts
import { checkDatabaseReadiness } from "@/lib/health/readiness";

export async function GET() {
  const ready = await checkDatabaseReadiness();
  return Response.json(
    { status: ready ? "ready" : "unavailable" },
    { status: ready ? 200 : 503 },
  );
}
```

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- src/lib/health/readiness.test.ts src/app/api/health/live/route.test.ts src/app/api/health/ready/route.test.ts`

Expected: 3 test files PASS.

```powershell
git add apps/web/src/lib/health apps/web/src/app/api/health
git commit -m "feat: add deployment health endpoints"
```

### Task 2: Build a Minimal Standalone Production Image

**Files:**
- Create: `.dockerignore`
- Create: `apps/web/Dockerfile`
- Create: `apps/web/next.config.test.ts`
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: `npm ci`, `npm run build`, Next.js standalone output
- Produces: `music-pie-web:$releaseSha` image running `node server.js` on port `3000`, where PowerShell sets `$releaseSha = git rev-parse --short=12 HEAD`

- [ ] **Step 1: Pin the standalone contract in a test**

```ts
import { expect, it } from "vitest";
import config from "./next.config";

it("builds a standalone production server", () => {
  expect(config.output).toBe("standalone");
});
```

- [ ] **Step 2: Run the config test and verify it fails**

Run: `npm test -- next.config.test.ts`

Expected: FAIL because `config.output` is undefined.

- [ ] **Step 3: Enable standalone output without changing image remote patterns**

Add `output: "standalone"` to the existing `nextConfig` object and leave every `images.remotePatterns` entry unchanged.

- [ ] **Step 4: Add the root Docker context exclusions**

`.dockerignore` must contain:

```text
.git
.github
.env
.env.*
**/.env
**/.env.*
**/.next
**/node_modules
coverage
infra/runtime
infra/secrets
*.dump
*.log
node_modules
```

- [ ] **Step 5: Add the multi-stage Web Dockerfile**

```dockerfile
FROM node:24-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts ./apps/web/scripts
COPY --from=build --chown=node:node /app/src/lib/db/migrations ./apps/web/src/lib/db/migrations
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 6: Verify the image excludes secrets and runs as non-root**

Run from repository root:

```powershell
docker build --file apps/web/Dockerfile --tag music-pie-web:verify .
docker image inspect music-pie-web:verify --format '{{.Config.User}}'
docker run --rm --entrypoint node music-pie-web:verify -e "import('pg').then(()=>console.log('pg-ok'))"
```

Expected: build succeeds, user is `node`, output is `pg-ok`. Inspect the image history with `docker history --no-trunc music-pie-web:verify` and confirm no secret value or `.env.local` copy appears.

- [ ] **Step 7: Run the config test and commit**

Run: `npm test -- next.config.test.ts`

Expected: PASS.

```powershell
git add .dockerignore apps/web/Dockerfile apps/web/next.config.ts apps/web/next.config.test.ts
git commit -m "build: add standalone web image"
```

### Task 3: Track and Apply Database Migrations Safely

**Files:**
- Create: `apps/web/scripts/migrate.mjs`
- Create: `apps/web/scripts/migrate.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`, forward SQL files under `apps/web/src/lib/db/migrations`
- Produces: `loadForwardMigrations(directory)`, `planMigrations(files, applied)`, CLI options `--baseline-through=006_musicbrainz_genres.sql` and default apply mode

- [ ] **Step 1: Write planner tests**

Cover these exact cases:

```ts
it("ignores down migrations and sorts forward migrations by filename");
it("plans only files absent from schema_migrations");
it("throws before applying when an applied checksum differs");
it("refuses baseline when any expected table or column is absent");
it("uses an advisory lock so two migration jobs cannot apply together");
```

The checksum mismatch assertion must include the migration filename but not SQL contents or `DATABASE_URL`.

- [ ] **Step 2: Run the migration tests and verify they fail**

Run: `npm test -- scripts/migrate.test.ts`

Expected: FAIL because `migrate.mjs` does not exist.

- [ ] **Step 3: Implement deterministic discovery and planning**

`loadForwardMigrations(directory)` must select `/^\d{3}_.+\.sql$/`, exclude `.down.sql`, read UTF-8, calculate lowercase SHA-256, and return `{ id, checksum, sql }[]` sorted by `id`.

`planMigrations(files, applied)` must throw an error such as `Migration checksum mismatch: 001_user_tidal_connections.sql` if an applied id has a different checksum and otherwise return only unapplied files.

- [ ] **Step 4: Implement schema tracking and atomic application**

The CLI must:

1. require `DATABASE_URL` without printing it;
2. connect one `pg.Client`;
3. acquire `pg_advisory_lock(hashtext('music-pie-schema-migrations'))`;
4. create `schema_migrations(id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
5. for each pending file, execute its SQL and tracking insert in one transaction;
6. rollback the current file on error;
7. release the advisory lock and close the client in `finally`.

Baseline mode must verify `app_users`, `tidal_connections`, `user_playlists`, `music_tracks`, `user_playlist_tracks`, `playlist_imports`, `musicbrainz_enrichment_jobs`, `musicbrainz_rate_limits`, `user_likes`, `musicbrainz_artists`, `music_tracks.mb_genres`, and `music_tracks.mb_tags` exist before recording migrations `001` through `006` with their calculated checksums. It must not execute those six SQL files.

- [ ] **Step 5: Run tests and an isolated PostgreSQL rehearsal**

Create an ephemeral test container with an explicit name and no named volume:

```powershell
docker run --name music-pie-migration-test -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=music_pie_test -p 127.0.0.1:55435:5432 -d postgres:16.15-alpine
```

Wait for `pg_isready`, then run the migration CLI with `DATABASE_URL=postgresql://postgres:test-only@127.0.0.1:55435/music_pie_test`. Run it a second time and confirm zero pending migrations. Remove only `music-pie-migration-test` after confirming its exact name.

Expected: first run applies `001` through `006`; second run reports `0 pending migrations`; unit tests PASS.

- [ ] **Step 6: Commit the migration runner**

```powershell
git add apps/web/scripts/migrate.mjs apps/web/scripts/migrate.test.ts
git commit -m "feat: add tracked database migrations"
```

### Task 4: Define the Isolated Zorin Compose Stack and Secret Contract

**Files:**
- Create: `infra/compose.zorin.yml`
- Create: `infra/secrets/compose.env.example`
- Create: `infra/secrets/database.env.example`
- Create: `infra/secrets/web.env.example`
- Create: `infra/secrets/tunnel.env.example`
- Create: `infra/scripts/check-secrets.sh`
- Create: `infra/scripts/check-secrets.test.sh`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `APP_VERSION`, PostgreSQL credentials, existing app settings, `TUNNEL_TOKEN`
- Produces: Compose services `postgres`, `web`, `tunnel`, `migrate`

- [ ] **Step 1: Write the failing secret validation test**

The shell test must create a temporary directory and assert that `check-secrets.sh`:

- succeeds for mode `700` directory and four mode `600` files containing all required keys;
- fails when `TOKEN_ENCRYPTION_KEY` is missing;
- fails when a value is empty or contains `change-me`;
- fails when a file mode is `644`;
- never prints secret values.

Run: `bash infra/scripts/check-secrets.test.sh`

Expected: FAIL because the validator is missing.

- [ ] **Step 2: Implement the secret validator**

`check-secrets.sh /home/approid/apps/music-pie/shared/secrets` must validate the directory passed as its first argument:

- directory mode `700`;
- file mode `600` for `compose.env`, `database.env`, `web.env`, `tunnel.env`;
- `COMPOSE_PROJECT_NAME=music-pie` and non-empty `APP_VERSION`;
- `POSTGRES_DB=music_pie`, `POSTGRES_USER=music_pie`, non-empty `POSTGRES_PASSWORD`;
- all app keys currently present in `apps/web/.env.example`, plus non-empty `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `APP_BASE_URL=https://mrms.approid.team`;
- non-empty `TUNNEL_TOKEN`.

Errors must name only the file and key, never the value.

- [ ] **Step 3: Add tracked example files and ignore real secrets**

Add these exceptions to `.gitignore`:

```gitignore
!infra/secrets/
infra/secrets/*
!infra/secrets/*.env.example
```

Each example file contains the exact required keys with documented non-secret example values. `web.env.example` uses `DATABASE_URL=postgresql://music_pie:example@postgres:5432/music_pie` and `APP_BASE_URL=https://mrms.approid.team`.

- [ ] **Step 4: Add the Compose model**

Use these fixed resources:

- project name from `COMPOSE_PROJECT_NAME=music-pie`;
- Web binding `127.0.0.1:3104:3000`;
- volume `music-pie-postgres-data`;
- networks `music-pie-frontend`, `music-pie-backend` with `internal: true`, and `music-pie-egress`;
- PostgreSQL image `postgres:16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`;
- Tunnel image `cloudflare/cloudflared:latest@sha256:ff69a2225ad7c6f85ed84fbd5f3087df46202426b2388ec60214098e0adf05e9`;
- `local` log driver with `max-size: 10m`, `max-file: "3"`;
- Web health command fetching `http://127.0.0.1:3000/api/health/ready`;
- Tunnel profile `tunnel` and migration profile `tools`.

The migration service uses the same Web image and runs `node apps/web/scripts/migrate.mjs`. PostgreSQL connects only to `backend`; Tunnel connects only to `frontend`; Web connects to all three networks.

- [ ] **Step 5: Validate the examples and Compose model**

Copy examples into a temporary directory, set mode `700/600`, run the validator, then run:

```bash
docker compose --env-file infra/secrets/compose.env.example \
  -p music-pie -f infra/compose.zorin.yml config --quiet
```

Expected: validator and Compose parse both succeed. `docker compose config` without `--quiet` is not used against real secret files.

- [ ] **Step 6: Commit Compose and secret contracts**

```powershell
git add .gitignore infra/compose.zorin.yml infra/secrets infra/scripts/check-secrets.sh infra/scripts/check-secrets.test.sh
git commit -m "build: define isolated Zorin stack"
```

### Task 5: Add Collision Preflight and Deployment Verification

**Files:**
- Create: `infra/scripts/preflight-zorin.sh`
- Create: `infra/scripts/preflight-zorin.test.sh`
- Create: `infra/scripts/verify-deployment.sh`
- Create: `infra/scripts/verify-deployment.test.sh`
- Create: `infra/scripts/compare-row-counts.mjs`
- Create: `infra/scripts/compare-row-counts.test.mjs`

**Interfaces:**
- Consumes: Docker CLI, `ss`, `curl`, JSON count manifests
- Produces: non-zero exit on resource collision, unhealthy deployment, wrong status, or count mismatch

- [ ] **Step 1: Write collision preflight tests**

Stub `docker` and `ss` through a temporary `PATH`. Assert the script:

- succeeds when `3104` and all `music-pie-*` names are absent;
- fails when port `3104` is listening;
- fails when a `music-pie-*` resource exists without Compose label `com.docker.compose.project=music-pie`;
- permits resources labeled for the `music-pie` project during redeploy.

Run: `bash infra/scripts/preflight-zorin.test.sh`

Expected: FAIL before the script exists.

- [ ] **Step 2: Implement preflight checks**

The script must inspect port `3104`, container names, `music-pie-frontend`, `music-pie-backend`, `music-pie-egress`, and `music-pie-postgres-data`. It must print resource names and ownership only, not inspect or print any environment variables.

- [ ] **Step 3: Write and implement HTTP verification tests**

Stub `curl` and `docker compose`. Verify these exact expectations:

| URL | Status |
|---|---:|
| `http://127.0.0.1:3104/api/health/live` | 200 |
| `http://127.0.0.1:3104/api/health/ready` | 200 |
| `http://127.0.0.1:3104/` | 200 |
| `http://127.0.0.1:3104/search` | 200 |
| `http://127.0.0.1:3104/mms` | 200 |
| `https://mrms.approid.team/` | 200 |
| `https://mrms.approid.team/search` | 200 |
| `https://mrms.approid.team/mms` | 200 |
| `https://mrms.approid.team/api/likes` | 401 |

The script accepts `--local-only` before Tunnel cutover and skips only the four public checks in that mode.

- [ ] **Step 4: Write and implement row-count manifest comparison**

`compare-row-counts.mjs source-counts.json target-counts.json` must require identical table-name sets and integer counts. It exits non-zero and names differing tables without printing row contents. Tests cover missing table, extra table, count mismatch, invalid JSON, and exact match.

- [ ] **Step 5: Run all script tests and commit**

```bash
bash infra/scripts/preflight-zorin.test.sh
bash infra/scripts/verify-deployment.test.sh
node infra/scripts/compare-row-counts.test.mjs
```

Expected: all pass.

```powershell
git add infra/scripts
git commit -m "test: add Zorin deployment gates"
```

### Task 6: Write the Exact Deployment and Rollback Runbook

**Files:**
- Create: `docs/deployment/zorin-production-runbook.md`

**Interfaces:**
- Consumes: artifacts and scripts from Tasks 1-5
- Produces: operator procedure for staging, data transfer, cutover, rollback

- [ ] **Step 1: Document local release preparation**

Record exact PowerShell commands to:

1. confirm a clean worktree and set `$releaseSha = git rev-parse --short=12 HEAD`;
2. run `npm test`, `npm run lint`, `npm run build` in `apps/web`;
3. build `music-pie-web:$releaseSha`;
4. set `$releaseArchive = Join-Path ([System.IO.Path]::GetTempPath()) "music-pie-$releaseSha.tar"`, confirm it starts with `[System.IO.Path]::GetTempPath()`, and create it with `git archive --format=tar --output=$releaseArchive HEAD`;
5. transfer it with the existing `approid_server` SSH key;
6. extract it under `/home/approid/apps/music-pie/releases/$releaseSha` and switch a `current` symlink only after build success.

The runbook must require resolving and printing the temp path before deletion, and must forbid archive paths outside the OS temp directory.

- [ ] **Step 2: Document secret provisioning without output**

Record commands that create `/home/approid/apps/music-pie/shared/secrets` with mode `700`, transfer `.env.local` as a temporary mode `600` input, create a hex PostgreSQL password on Zorin, replace only `DATABASE_URL`, and remove the temporary input after `check-secrets.sh` succeeds.

Record a stdin-only transfer for the existing Tunnel token:

```powershell
cloudflared tunnel token music-pie | ssh -i "$env:USERPROFILE\.ssh\approid_server" approid@192.168.219.174 'umask 077; { printf "TUNNEL_TOKEN="; cat; } > /home/approid/apps/music-pie/shared/secrets/tunnel.env'
```

The runbook must warn that neither the token command nor `docker compose config` may be run in a form that prints values.

- [ ] **Step 3: Document staging and preliminary restore**

Use `preflight-zorin.sh`, `check-secrets.sh`, `docker compose ... config --quiet`, image build, PostgreSQL-only startup, custom-format `pg_dump`, SHA-256 checksum, SCP, `pg_restore --exit-on-error`, baseline migration recording, row-count comparison, Web startup, and `verify-deployment.sh --local-only` in that order.

- [ ] **Step 4: Document final cutover and rollback gates**

The cutover section must require:

1. exact PID/container verification for Windows Web and `music-pie` connector;
2. stop Windows connector and Web;
3. final dump, checksum, transfer, clean restore into the Zorin `music_pie` DB;
4. row-count equality and Zorin local smoke;
5. start only the Zorin Tunnel profile;
6. public smoke and real-login checks;
7. record the release SHA.

Rollback before Zorin writes: stop only the Zorin Tunnel container, restart the verified Windows Web and connector, then run public smoke. Rollback after Zorin writes requires a data reconciliation decision and must not overwrite either DB.

- [ ] **Step 5: Review commands for destructive scope and commit**

Verify every stop, restore, cleanup, and symlink command names an exact `music-pie` path, process, container, DB, or temporary file. Confirm the runbook contains none of the forbidden volume/prune commands except in a clearly marked prohibition.

```powershell
git add docs/deployment/zorin-production-runbook.md
git commit -m "docs: add Zorin deployment runbook"
```

### Task 7: Run the Full Local Gate and Stage Zorin Without Public Cutover

**Files:**
- Modify only if verification exposes a defect in Tasks 1-6

**Interfaces:**
- Consumes: verified release commit and runbook
- Produces: healthy Zorin PostgreSQL and Web accessible only at `127.0.0.1:3104`

- [ ] **Step 1: Run repository verification**

```powershell
Set-Location apps/web
npm test
npm run lint
npm run build
Set-Location ../..
git diff --check
```

Expected: all tests, ESLint, build, and diff check pass. Record actual test file and test counts rather than copying prior counts.

- [ ] **Step 2: Build and inspect the release image locally**

Build with the exact current SHA tag, verify non-root user, confirm the migration CLI can import `pg`, and run the container against an ephemeral PostgreSQL instance until `/api/health/ready` returns 200.

- [ ] **Step 3: Transfer a clean release and provision server-only secrets**

Follow the runbook. Do not transfer the untracked Windows document `docs/plans/portable-self-hosted-deployment-guide.md`, `.env.local` into a release directory, `node_modules`, `.next`, DB dumps into Git-controlled paths, or any other project’s secrets.

- [ ] **Step 4: Run Zorin preflight and start PostgreSQL only**

Confirm the existing `alpha-momega`, `b2b-stm`, `hud-admin`, `real-es`, and `sdtpl-adm` services remain healthy before and after starting `music-pie-postgres`.

- [ ] **Step 5: Restore a preliminary backup and compare data**

Generate source and target JSON count manifests for the ten current public tables. Run `compare-row-counts.mjs`; expected exit code is 0 with every count equal. Run the migration CLI in baseline mode and then default mode; expected result is baseline `001`-`006` recorded and `0 pending migrations`.

- [ ] **Step 6: Start Web and run local-only verification**

Start `web` without the `tunnel` profile. SSH port-forward `3104` if browser inspection is required. Run `verify-deployment.sh --local-only` and confirm container health. Do not start the Zorin Tunnel yet.

- [ ] **Step 7: Record staging evidence**

Record release SHA, image tag, DB checksum, source/target counts, container health, local HTTP results, and any unverified browser-only checks in the change document draft. Do not record secret values or signed stream URLs.

### Task 8: Perform Final Data Cutover and Real-Server Verification

**Files:**
- Create: `docs/changes/2026-09-22-zorin-production-deployment.md`
- Modify: `docs/overview/current-development-context.md`

**Interfaces:**
- Consumes: staged Zorin stack from Task 7
- Produces: `mrms.approid.team` served only from Zorin with migrated data

- [ ] **Step 1: Capture final pre-cutover state**

Record Windows DB counts, current release SHA, exact Windows Web PID and command line, exact Windows `cloudflared tunnel run music-pie` PID, and Zorin container state. Verify no Zorin Tunnel container is running.

- [ ] **Step 2: Enter the write-free maintenance window**

Stop only the verified Windows `music-pie` connector and `44119` Next.js process. Confirm the public endpoint is unavailable and the PostgreSQL source remains running. If either process identity differs from the recorded command, stop and investigate instead of killing it.

- [ ] **Step 3: Create and restore the final backup**

Run `pg_dump --format=custom` inside `music-pie-postgres`, calculate SHA-256, transfer via SCP, verify the checksum on Zorin, stop the staged Web, and restore with `pg_restore --clean --if-exists --exit-on-error` into only the Zorin `music_pie` database.

- [ ] **Step 4: Enforce the data and local health gates**

Generate fresh manifests and require exact equality for all ten tables. Run migration baseline/default checks and `verify-deployment.sh --local-only`. If any command fails, leave Zorin Tunnel stopped and restart the Windows Web and connector.

- [ ] **Step 5: Start the Zorin connector and verify single ownership**

Start Compose with profile `tunnel`. Confirm Zorin has exactly one `music-pie-tunnel` container and Windows has no `cloudflared tunnel run music-pie` process. Run the full `verify-deployment.sh`.

- [ ] **Step 6: Verify real user flows on the deployed server**

Using the existing account, verify:

1. Auth0 login and callback return to `mrms.approid.team`;
2. TIDAL connection state is preserved;
3. MMS shows 3 imported playlists and their saved tracks;
4. search works;
5. a playable TIDAL track starts, seek works, and next-track transition works;
6. Device Code reauthorization succeeds if the provider requires it;
7. likes API/UI still respects the authenticated user boundary.

Do not create likes solely to change the expected migrated count unless the test action and resulting count are recorded.

- [ ] **Step 7: Check isolation and logs**

Confirm all pre-existing Zorin projects are still healthy. Review only recent `music-pie` logs for errors and verify they contain no token, cookie, DB password, or complete signed stream URL.

- [ ] **Step 8: Update project records**

Write the change record in Korean with:

- 이유와 scope;
- deployed SHA and image tag;
- source and target DB checksums/counts;
- exact successful commands and HTTP results;
- real user-flow results;
- rollback state retained on Windows;
- unverified items and next work.

Update `current-development-context.md` so Zorin is the active production host, Windows is rollback-only, and the next development task is the separately designed embedding runtime/vector persistence work.

- [ ] **Step 9: Run final documentation and Git checks, then commit**

```powershell
git diff --check
git status --short
git add docs/changes/2026-09-22-zorin-production-deployment.md docs/overview/current-development-context.md
git commit -m "docs: record Zorin production migration"
```

Expected: only intended deployment records are committed; the original checkout’s untracked `docs/plans/portable-self-hosted-deployment-guide.md` remains untouched and untracked.
