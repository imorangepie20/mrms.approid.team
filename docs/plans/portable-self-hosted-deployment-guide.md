# 다른 프로젝트에 자체 호스팅 배포 구조 적용하기

이 문서는 Docker Compose, GitHub Actions, PostgreSQL, Cloudflare Tunnel 배포 구조를 다른 웹 프로젝트에 적용하는 방법을 설명합니다. 이 파일 하나만 전달해도 필요한 배포 파일을 만들 수 있도록 전체 템플릿과 최초 배포, 검증, 재배포, 롤백, 복구 절차를 모두 포함합니다.

## 문서 목표와 적용 범위

이 문서만으로 새 프로젝트의 배포 경계를 설계하고, 필요한 파일을 만들고, 운영 전 검증 항목을 결정할 수 있어야 합니다.

| 항목 | 내용 |
|---|---|
| 문서 유형 | How-to |
| 대상 | Node.js 웹·API와 PostgreSQL을 Linux 서버에 배포하는 개발자·운영자 |
| 기준 구현 | Node.js 24, npm workspace, Next.js Web, Node.js API, PostgreSQL 16 |
| 포함 | 컨테이너 경계, 비밀값, DB 역할, migration, health check, CI, 배포, 롤백, 백업·관측성 기준 |
| 제외 | 특정 클라우드의 과금, 조직별 승인 절차, 실제 운영 비밀값, 무중단 다중 노드 구성 |

이 구조는 단일 Linux 호스트에 적합합니다. 아래 템플릿은 `apps/api`, `apps/web` npm workspace를 가정합니다. 다른 framework나 디렉터리 구조에서는 build·start 명령과 산출물 경로만 바꿉니다. 여러 서버, 자동 확장, 무중단 schema 전환이 필요하면 이미지 빌드와 검증 원칙만 재사용하고 오케스트레이션 계층은 별도로 설계합니다.

## 먼저 결정할 값

파일을 복사하기 전에 아래 값을 확정합니다. 같은 호스트의 다른 프로젝트와 하나라도 겹치면 컨테이너, 네트워크, 볼륨 또는 포트가 충돌할 수 있습니다.

| 논리 값 | B2B-STM 예시 | 새 프로젝트 예시 | 사용 위치 |
|---|---|---|---|
| 프로젝트 slug | `b2b-stm` | `inventory-portal` | Compose project, 이미지, 네트워크, 볼륨 |
| 저장소 경로 | `~/apps/b2b-stm` | `~/apps/inventory-portal` | clone, 운영 명령 |
| 공개 origin | `https://stm.approid.team` | `https://inventory.example.com` | CSRF, cookie, 외부 점검 |
| Web 내부 포트 | `3101` | `4101` | Web 컨테이너와 host loopback |
| API 내부 포트 | `3200` | `4200` | API 컨테이너와 host loopback |
| 운영 DB | `b2b_stm` | `inventory_portal` | PostgreSQL, 연결 URL |
| migration 역할 | `b2b_stm_migrator` | `inventory_portal_migrator` | schema 소유권과 migration |
| app 역할 | `b2b_stm_app` | `inventory_portal_app` | API의 업무 쿼리 |
| Compose 파일 | `infra/compose.zorin.yml` | `infra/compose.production.yml` | 모든 운영 명령 |
| Tunnel 이름 | `b2b-stm-zorin` | `inventory-portal-prod` | Cloudflare connector |

포트가 외부에 공개될 이유가 없다면 host binding을 `127.0.0.1`로 제한합니다. 공개 트래픽은 Tunnel이나 reverse proxy 한 곳에서만 받습니다.

## 배포 구조 이해하기

이 배포는 Web을 단일 공개 진입점으로 사용합니다. 브라우저의 `/api/*` 요청은 Next.js Web이 내부 API로 전달합니다.

| 계층 | 역할 | 외부 노출 | 템플릿 service |
|---|---|---|---|
| Tunnel | TLS 종료와 공개 hostname 연결 | 인터넷 | `tunnel` |
| Web | UI 제공과 `/api/*` reverse proxy | host loopback, Tunnel | `web` |
| API | 인증과 업무 처리 | host loopback, Web | `api` |
| PostgreSQL | 영속 데이터 | 없음 | `postgres` service |
| ClamAV | 첨부 악성 파일 검사 | 없음 | `clamav` service |
| migrate | schema 변경용 일회성 job | 없음 | `migrate` service |
| seed·bootstrap | 데이터와 최초 계정 생성용 일회성 job | 없음 | `demo-seed`, bootstrap 명령 |

Compose 네트워크도 역할별로 나눕니다:

- `frontend`: Tunnel과 Web만 연결
- `backend`: Web, API, PostgreSQL, 내부 도구를 연결하고 `internal: true` 적용
- `egress`: 외부 통신이 필요한 API와 백신 서명 갱신 service만 연결

새 프로젝트에 ClamAV가 필요하지 않으면 service, volume, 환경 변수와 API readiness 의존성을 함께 제거합니다. service만 지우고 readiness 검사를 남기면 배포가 계속 실패합니다.

## 템플릿 적용 범위 구분하기

아래 전체 템플릿을 기준으로 파일을 만듭니다. 먼저 모든 `inventory-portal`, `inventory_portal`, `inventory.example.com`, `4101`, `4200`을 새 프로젝트 값으로 교체합니다.

| 파일 | 유지할 구조 | 반드시 교체할 내용 |
|---|---|---|
| `apps/api/Dockerfile` | build/runtime 단계 분리, non-root 실행, production dependency | workspace 경로, build 명령, 포트, 시작 명령 |
| `apps/web/Dockerfile` | standalone 산출물, non-root 실행, telemetry 비활성 | framework 산출물 경로, 포트, backend origin |
| `infra/compose.production.yml` | service 분리, health dependency, named volume, 로그 회전 | 이름, 이미지, 포트, DB, 선택 service, digest |
| `infra/secrets/*.env.example` | 파일별 권한 경계와 key 목록 | 실제 origin, DB명, 역할명, 포트 |
| `infra/scripts/check-secrets.sh` | mode·필수 key·placeholder 검사 | 프로젝트 고정값과 정규식 |
| `infra/scripts/verify-deployment.sh` | 내부·외부 endpoint를 함께 검사 | hostname, 경로, 기대 status |
| `.github/workflows/ci.yml` | clean checkout에서 build·test·Compose 검증 | runtime, DB service, migration·test 명령, 이미지명 |
| `.github/workflows/availability.yml` | 수동·주기 readiness 확인 | URL, 주기, 알림 방식 |
| `infra/postgres/init/10-application-role.sh` | migrator와 app 역할 분리 | DB명, 역할명, privilege 범위 |

다음 항목은 절대 복사하지 않습니다:

- `.env`, Tunnel token, SMTP credential, DB 비밀번호
- 운영 DB dump, session cookie, MFA key, CSRF secret
- 기존 프로젝트의 named volume, DNS record, Tunnel ID
- 기존 서버의 내부 IP와 관리자 계정 정보
- 현재 CPU architecture를 확인하지 않은 이미지 digest

## 배포 파일 구성하기

새 프로젝트에는 다음 구조를 권장합니다. 파일 이름은 바꿔도 역할 경계는 유지합니다.

```text
apps/
  api/Dockerfile
  web/Dockerfile
infra/
  compose.production.yml
  postgres/init/10-application-role.sh
  runtime/.gitkeep
  scripts/check-secrets.sh
  scripts/verify-deployment.sh
  secrets/*.env.example
.dockerignore
.github/workflows/ci.yml
.github/workflows/availability.yml
```

`infra/secrets`와 `infra/runtime`의 실제 파일은 Git과 Docker build context에서 제외합니다. 예제 파일과 빈 디렉터리 유지용 `.gitkeep`만 커밋합니다.

## production 이미지를 만들기

API와 Web 이미지는 build 단계와 runtime 단계를 분리합니다. runtime 이미지에는 소스 전체와 개발 dependency를 넣지 않습니다.

API Dockerfile은 다음 조건을 충족해야 합니다:

1. lockfile 기준으로 dependency를 설치합니다.
2. build 단계에서 TypeScript 또는 framework build를 실행합니다.
3. runtime 단계에는 production dependency와 실행 산출물만 복사합니다.
4. migration 파일과 운영 script가 필요하면 명시적으로 복사합니다.
5. root가 아닌 사용자로 실행합니다.
6. container port와 시작 명령을 고정합니다.

Web Dockerfile은 backend origin이 build time 값인지 runtime 값인지 먼저 확인합니다. B2B-STM의 Next.js rewrite는 build 결과에 반영되므로 `API_BACKEND_ORIGIN`을 build argument로 전달합니다. 다른 framework가 runtime proxy 설정을 읽는다면 runtime 환경 변수만 사용합니다.

이미지 build 검증은 실제 배포와 같은 repository root context에서 실행합니다:

```bash
docker build --file apps/api/Dockerfile \
  --tag inventory-portal-api:verify .
docker build --file apps/web/Dockerfile \
  --tag inventory-portal-web:verify .
```

`.dockerignore`에는 최소한 다음 항목을 포함합니다:

- `.git`, CI metadata, local build 산출물
- `node_modules`, test report, coverage
- `.env*`, `infra/secrets`, 운영 runtime 파일
- DB dump, 로그, 로컬 도구 cache

필요한 파일까지 제외하지 않았는지 clean checkout에서 이미지를 build해 확인합니다. 로컬에 남은 `dist`나 `.env.local`이 Dockerfile 누락을 가릴 수 있습니다.

## Compose service를 분리하기

장기 실행 service와 일회성 job을 구분합니다. migration을 API 시작 command에 묶으면 여러 API replica가 동시에 schema를 변경할 수 있습니다.

| 종류 | 예시 | restart 정책 | 실행 방식 |
|---|---|---|---|
| 장기 service | `postgres`, `api`, `web`, `tunnel` | `unless-stopped` | `docker compose up -d` |
| 선택 service | `clamav`, queue worker | 요구에 따라 결정 | profile 또는 기본 service |
| 일회성 job | `migrate`, `seed`, `bootstrap` | 없음 | `docker compose run --rm` |

장기 service에는 health check를 추가합니다. `depends_on.condition: service_healthy`는 시작 순서를 보조하지만 업무 준비 완료를 대신하지 않습니다.

Compose에서 다음 이름을 project slug로 고정합니다:

- `COMPOSE_PROJECT_NAME`
- application image tag prefix
- network `name`
- volume `name`

명시적 이름을 쓰면 운영 명령과 점검이 쉬워집니다. 같은 호스트에서는 이름 중복 여부를 배포 전에 검사해야 합니다.

로그 driver에는 회전 한도를 둡니다. B2B-STM은 장기 service에 Docker `local` driver, 파일당 `10m`, 최대 3개를 적용합니다. 새 프로젝트는 요청량과 보존 요구를 계산해 값을 결정하고 중앙 로그 수집 여부를 별도로 정합니다.

## 비밀값을 파일별로 분리하기

하나의 `.env`를 모든 컨테이너에 주입하지 않습니다. service가 필요한 값만 읽도록 파일을 분리합니다.

| 파일 | 허용할 값 | 읽는 service |
|---|---|---|
| `compose.env` | project 이름, release version | Compose CLI |
| `database.env` | DB 초기화 계정과 app 역할 생성 값 | PostgreSQL |
| `migration.env` | schema owner 연결 URL | migrate job |
| `api.env` | app DB URL, origin, crypto key, mail, scanner | API |
| `web.env` | 내부 API origin 등 공개 가능 runtime 설정 | Web |
| `tunnel.env` | 새 프로젝트 전용 connector token | Tunnel |

Linux host에서 secrets 디렉터리는 mode `700`, 각 파일은 `600`으로 제한합니다. 초기화 script는 기존 파일이 하나라도 있으면 덮어쓰지 않아야 합니다.

비밀번호 생성과 URL 입력은 별도 단계입니다:

1. migrator와 app 비밀번호를 각각 생성합니다.
2. CSRF와 암호화 key도 각각 생성합니다.
3. 연결 URL의 사용자명과 비밀번호를 URL encode합니다.
4. example placeholder가 남지 않았는지 검사합니다.
5. 파일 mode와 필수 key를 검사합니다.
6. `docker compose config --quiet`로 최종 model을 검증합니다.

검증 명령은 값을 출력하지 않아야 합니다:

```bash
infra/scripts/check-secrets.sh
docker compose --env-file infra/secrets/compose.env \
  -p inventory-portal \
  -f infra/compose.production.yml config --quiet
```

`docker compose config`의 전체 출력은 환경 변수를 노출할 수 있습니다. 운영 점검에는 `--quiet`를 사용합니다.

## PostgreSQL 권한을 분리하기

API 계정에 schema 변경 권한을 주지 않습니다. 최소 두 역할을 둡니다:

- migration 역할: schema와 migration metadata를 소유
- app 역할: 필요한 table의 `SELECT`, `INSERT`, `UPDATE`, `DELETE`와 sequence 사용

초기화 script는 DB명과 역할명이 기대값과 다르면 종료해야 합니다. 이 검사는 잘못된 프로젝트 DB에 privilege를 적용하는 사고를 막습니다.

PostgreSQL의 `/docker-entrypoint-initdb.d` script는 새 volume을 처음 만들 때만 실행됩니다. 이미 생성된 volume에 init script를 추가해도 자동으로 다시 실행되지 않습니다. 기존 DB는 검토한 SQL을 별도 관리 명령으로 적용합니다.

다음 순서로 초기화합니다:

1. PostgreSQL만 시작하고 health를 확인합니다.
2. migration job을 한 번 실행합니다.
3. migration job을 다시 실행해 `0 applied` 또는 동등한 무변경 결과를 확인합니다.
4. 필요한 경우 idempotent seed를 두 번 실행합니다.
5. 최초 관리자 bootstrap은 hidden prompt로 실행합니다.

운영 데이터에 DEMO seed를 실행하지 않습니다. 프로젝트 목적상 필요하면 대상 DB, 확인 문자열, namespace를 script에서 검사합니다.

## health endpoint를 설계하기

liveness와 readiness를 분리합니다:

- liveness: 프로세스가 요청에 응답하는지만 확인
- readiness: 새 요청을 처리하는 데 필요한 DB, scanner, queue 등의 의존성을 확인

B2B-STM은 `/api/health/live`와 `/api/health/ready`를 사용합니다. ClamAV 연결이 필요한 production에서는 scanner 장애도 readiness 실패로 처리합니다.

점검 계층을 세 단계로 나눕니다:

1. 컨테이너 내부 health check
2. 서버의 `127.0.0.1` endpoint
3. 공개 hostname의 Web과 API readiness

세 단계가 모두 성공해야 배포 성공으로 기록합니다. 공개 readiness 하나만 확인하면 Tunnel은 검증할 수 있지만 내부 port binding과 service별 원인은 분리하기 어렵습니다.

health endpoint에는 비밀값, stack trace, DB hostname, version inventory를 노출하지 않습니다. `status: ok`처럼 판정에 필요한 최소 정보만 반환합니다.

## CI gate를 구성하기

배포할 commit은 clean checkout에서 모든 gate를 통과해야 합니다. B2B-STM CI는 다음 순서를 사용합니다:

1. repository checkout과 Node.js 고정
2. `npm ci`
3. 임시 PostgreSQL과 필요한 역할 생성
4. test migration 적용
5. API build와 foundation test
6. Web production build
7. 공개 저장소 비밀값·제외 규칙 검사
8. example env로 Compose model 검증
9. API와 Web deployment image build

새 프로젝트의 CI도 최소한 build, test, Compose parse, image build를 포함해야 합니다. 배포 서버에서 처음 발견되는 Dockerfile 누락은 CI gate가 충분하지 않다는 뜻입니다.

GitHub Actions의 action major version, Node.js version, PostgreSQL tag를 고정합니다. production image base와 CI runtime의 major version도 맞춥니다.

CI가 통과한 commit SHA와 서버의 `git rev-parse HEAD`가 같아야 합니다. branch 이름이 같다는 사실만으로 같은 release라고 판단하지 않습니다.

## 이미지 tag와 digest를 관리하기

application image에는 commit SHA 또는 release ID를 tag로 사용합니다. `local`과 `latest`만 사용하면 어떤 소스가 실행 중인지 확인하기 어렵습니다.

외부 base image는 tag를 pull한 뒤 배포 대상 architecture의 `RepoDigest`를 확인합니다. 검증한 digest를 Compose에 기록하고 CI를 다시 통과시킵니다.

digest 고정에는 운영 절차가 필요합니다:

1. 보안 업데이트가 포함된 새 tag를 조사합니다.
2. 대상 architecture에서 pull하고 digest를 확인합니다.
3. Compose digest를 변경합니다.
4. build·test·smoke를 실행합니다.
5. release와 rollback 대상 digest를 기록합니다.

digest 고정은 업데이트를 자동으로 제공하지 않습니다. 정기 갱신 담당과 주기를 정하지 않으면 취약한 image가 계속 유지됩니다.

## 단일 문서용 전체 파일 템플릿

이 절의 파일을 순서대로 생성하면 배포 골격이 완성됩니다. 먼저 다음 문자열을 프로젝트 값으로 일괄 교체합니다:

| 템플릿 값 | 의미 |
|---|---|
| `inventory-portal` | Compose·image·network·volume용 slug |
| `inventory_portal` | PostgreSQL DB와 역할 prefix |
| `inventory.example.com` | 공개 hostname |
| `4101` | Web port |
| `4200` | API port |

application은 `/api/health/live`와 `/api/health/ready`를 제공해야 합니다. npm script는 `build:api`, `build:web`, `test`, `db:migrate:test`를 기준으로 작성했습니다. 프로젝트의 실제 script가 다르면 Dockerfile과 CI에서 함께 바꿉니다.

### `.dockerignore`

아래 파일은 secret과 로컬 산출물이 image layer에 들어가는 것을 막습니다.

```gitignore
.git
.github
.env
.env.*
!.env.example
**/.next
**/dist
**/node_modules
coverage
infra/runtime
infra/secrets
node_modules
playwright-report
test-results
*.log
*.dump
```

### `apps/api/Dockerfile`

이 템플릿은 TypeScript API를 `apps/api/dist/main.js`로 build하는 npm workspace를 가정합니다.

```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY apps/api/db apps/api/db
COPY scripts scripts
RUN npm run build:api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/db apps/api/db
COPY --from=build --chown=node:node /app/scripts scripts

USER node
EXPOSE 4200
CMD ["node", "apps/api/dist/main.js"]
```

API가 migration 파일이나 `scripts` 디렉터리를 사용하지 않으면 해당 `COPY`를 제거합니다. 반대로 runtime에 필요한 template이나 정적 파일이 있으면 명시적으로 추가합니다.

### `apps/web/Dockerfile`

이 템플릿은 Next.js standalone 출력을 사용합니다.

```dockerfile
FROM node:24-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

ARG API_BACKEND_ORIGIN=http://api:4200
ENV API_BACKEND_ORIGIN=${API_BACKEND_ORIGIN}

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/web apps/web
RUN npm run build:web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=4101
WORKDIR /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node \
  /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node \
  /app/apps/web/public ./apps/web/public

USER node
EXPOSE 4101
CMD ["node", "apps/web/server.js"]
```

`apps/web/next.config.ts`에는 standalone 출력과 동일 origin API rewrite를 설정합니다:

```typescript
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const backend = process.env.API_BACKEND_ORIGIN
      ?? 'http://127.0.0.1:4200';
    return [{
      source: '/api/:path*',
      destination: `${backend}/api/:path*`,
    }];
  },
};

export default config;
```

기존 `next.config.ts`가 있으면 `output`과 `rewrites`를 병합합니다. 기존 설정을 통째로 덮어쓰지 않습니다.

### `infra/compose.production.yml`

이 Compose 파일은 PostgreSQL, ClamAV, API, Web, Tunnel과 일회성 migration job을 정의합니다.

```yaml
x-logging: &default-logging
  driver: local
  options:
    max-size: 10m
    max-file: "3"

services:
  postgres:
    image: postgres:16.15-alpine
    restart: unless-stopped
    env_file: ./secrets/database.env
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s
    networks: [backend]
    logging: *default-logging

  clamav:
    image: clamav/clamav:stable
    restart: unless-stopped
    volumes:
      - clamav-data:/var/lib/clamav
    healthcheck:
      test: ["CMD", "clamdscan", "--ping", "1"]
      interval: 15s
      timeout: 10s
      retries: 30
      start_period: 120s
    networks: [backend, egress]
    logging: *default-logging

  api:
    image: inventory-portal-api:${APP_VERSION:-local}
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    env_file: ./secrets/api.env
    depends_on:
      postgres:
        condition: service_healthy
      clamav:
        condition: service_healthy
    ports:
      - "127.0.0.1:4200:4200"
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          fetch('http://127.0.0.1:4200/api/health/ready')
          .then(r=>{if(!r.ok)process.exit(1)})
          .catch(()=>process.exit(1))
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s
    networks: [backend, egress]
    logging: *default-logging

  web:
    image: inventory-portal-web:${APP_VERSION:-local}
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
      args:
        API_BACKEND_ORIGIN: http://api:4200
    restart: unless-stopped
    env_file: ./secrets/web.env
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "127.0.0.1:4101:4101"
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          fetch('http://127.0.0.1:4101/')
          .then(r=>{if(!r.ok)process.exit(1)})
          .catch(()=>process.exit(1))
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s
    networks: [frontend, backend]
    logging: *default-logging

  tunnel:
    image: cloudflare/cloudflared:latest
    profiles: [tunnel]
    restart: unless-stopped
    env_file: ./secrets/tunnel.env
    command: tunnel --no-autoupdate run
    depends_on:
      web:
        condition: service_healthy
    networks: [frontend]
    logging: *default-logging

  migrate:
    image: inventory-portal-api:${APP_VERSION:-local}
    profiles: [tools]
    env_file: ./secrets/migration.env
    command: ["node", "scripts/migrate.mjs", "--production"]
    depends_on:
      postgres:
        condition: service_healthy
    networks: [backend]
    logging: *default-logging

networks:
  frontend:
    name: inventory-portal-frontend
  backend:
    name: inventory-portal-backend
    internal: true
  egress:
    name: inventory-portal-egress

volumes:
  postgres-data:
    name: inventory-portal-postgres-data
  clamav-data:
    name: inventory-portal-clamav-data
```

프로젝트에 파일 업로드가 없으면 `clamav` service, `clamav-data`, API의 ClamAV dependency와 관련 환경 변수를 함께 제거합니다. migration script의 실제 production option이 다르면 `migrate.command`를 수정합니다.

최초 검증 뒤 세 외부 image의 digest를 확인합니다:

```bash
docker pull postgres:16.15-alpine
docker pull clamav/clamav:stable
docker pull cloudflare/cloudflared:latest
docker image inspect --format '{{index .RepoDigests 0}}' \
  postgres:16.15-alpine
docker image inspect --format '{{index .RepoDigests 0}}' \
  clamav/clamav:stable
docker image inspect --format '{{index .RepoDigests 0}}' \
  cloudflare/cloudflared:latest
```

출력된 `image@sha256:...`를 Compose의 `image`에 반영하고 CI를 다시 실행합니다.

### `infra/secrets/*.env.example`

`infra/secrets/compose.env.example`:

```dotenv
COMPOSE_PROJECT_NAME=inventory-portal
APP_VERSION=local
```

`infra/secrets/database.env.example`:

```dotenv
POSTGRES_DB=inventory_portal
POSTGRES_USER=inventory_portal_migrator
POSTGRES_PASSWORD=replace_with_random_database_owner_password
APP_DB_USER=inventory_portal_app
APP_DB_PASSWORD=replace_with_different_random_app_password
```

`infra/secrets/migration.env.example`:

```dotenv
NODE_ENV=production
MIGRATION_DATABASE_URL=postgresql://inventory_portal_migrator:replace_with_url_encoded_password@postgres:5432/inventory_portal
```

`infra/secrets/api.env.example`:

```dotenv
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=4200
APP_ORIGIN=https://inventory.example.com
DATABASE_URL=postgresql://inventory_portal_app:replace_with_url_encoded_password@postgres:5432/inventory_portal
CSRF_SECRET=replace_with_at_least_64_hex_characters
MFA_ENCRYPTION_KEY=replace_with_exactly_64_hex_characters
MAIL_TRANSPORT=disabled
NOTIFICATION_WORKER_ENABLED=false
ATTACHMENT_SCAN_MODE=clamav
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=10000
```

`infra/secrets/web.env.example`:

```dotenv
NODE_ENV=production
API_BACKEND_ORIGIN=http://api:4200
```

`infra/secrets/tunnel.env.example`:

```dotenv
TUNNEL_TOKEN=replace_with_project_specific_tunnel_token
```

메일을 사용하면 `api.env`에 다음 값을 추가하고 worker 활성화 전에 outbox를 확인합니다:

```dotenv
MAIL_TRANSPORT=smtp
SMTP_URL=smtps://smtp_user:smtp_password@smtp.example.com:465
MAIL_FROM=Inventory Portal <no-reply@example.com>
NOTIFICATION_WORKER_ENABLED=true
```

### `infra/postgres/init/10-application-role.sh`

이 script는 새 PostgreSQL volume의 최초 초기화 때 application 역할을 생성합니다.

```bash
#!/bin/sh
set -eu

[ "$POSTGRES_DB" = "inventory_portal" ] || {
  echo "unexpected database" >&2
  exit 1
}
[ "$POSTGRES_USER" = "inventory_portal_migrator" ] || {
  echo "unexpected migrator" >&2
  exit 1
}
[ "${APP_DB_USER:-}" = "inventory_portal_app" ] || {
  echo "unexpected application role" >&2
  exit 1
}
[ -n "${APP_DB_PASSWORD:-}" ] || {
  echo "APP_DB_PASSWORD is required" >&2
  exit 1
}

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
REVOKE ALL ON DATABASE inventory_portal FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE ROLE inventory_portal_app LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  PASSWORD :'app_password';

GRANT CONNECT ON DATABASE inventory_portal
  TO inventory_portal_app;
GRANT USAGE ON SCHEMA public TO inventory_portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO inventory_portal_app;
GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public TO inventory_portal_app;

ALTER DEFAULT PRIVILEGES
  FOR ROLE inventory_portal_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO inventory_portal_app;
ALTER DEFAULT PRIVILEGES
  FOR ROLE inventory_portal_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES
  TO inventory_portal_app;
SQL
```

실행 권한을 추가합니다:

```bash
chmod 755 infra/postgres/init/10-application-role.sh
```

### `infra/scripts/initialize-secrets.sh`

이 script는 Linux 배포 host에서 실제 env 파일을 한 번만 생성합니다. 파일 상단의 project 값을 교체한 뒤 실행합니다.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")/../.."
secrets_dir=infra/secrets
runtime_dir=infra/runtime

for name in compose database migration api web tunnel; do
  [[ ! -e "$secrets_dir/$name.env" ]] || {
    echo "refusing to overwrite $name.env" >&2
    exit 1
  }
done

install -d -m 700 "$secrets_dir" "$runtime_dir"
umask 077
owner_password=$(openssl rand -hex 32)
app_password=$(openssl rand -hex 32)
csrf_secret=$(openssl rand -hex 32)
mfa_key=$(openssl rand -hex 32)

printf '%s\n' \
  'COMPOSE_PROJECT_NAME=inventory-portal' \
  'APP_VERSION=local' > "$secrets_dir/compose.env"

printf '%s\n' \
  'POSTGRES_DB=inventory_portal' \
  'POSTGRES_USER=inventory_portal_migrator' \
  "POSTGRES_PASSWORD=$owner_password" \
  'APP_DB_USER=inventory_portal_app' \
  "APP_DB_PASSWORD=$app_password" \
  > "$secrets_dir/database.env"

printf '%s\n' \
  'NODE_ENV=production' \
  "MIGRATION_DATABASE_URL=postgresql://inventory_portal_migrator:$owner_password@postgres:5432/inventory_portal" \
  > "$secrets_dir/migration.env"

printf '%s\n' \
  'NODE_ENV=production' \
  'API_HOST=0.0.0.0' \
  'API_PORT=4200' \
  'APP_ORIGIN=https://inventory.example.com' \
  "DATABASE_URL=postgresql://inventory_portal_app:$app_password@postgres:5432/inventory_portal" \
  "CSRF_SECRET=$csrf_secret" \
  "MFA_ENCRYPTION_KEY=$mfa_key" \
  'MAIL_TRANSPORT=disabled' \
  'NOTIFICATION_WORKER_ENABLED=false' \
  'ATTACHMENT_SCAN_MODE=clamav' \
  'CLAMAV_HOST=clamav' \
  'CLAMAV_PORT=3310' \
  'CLAMAV_TIMEOUT_MS=10000' \
  > "$secrets_dir/api.env"

printf '%s\n' \
  'NODE_ENV=production' \
  'API_BACKEND_ORIGIN=http://api:4200' \
  > "$secrets_dir/web.env"
printf 'TUNNEL_TOKEN=\n' > "$secrets_dir/tunnel.env"
chmod 600 "$secrets_dir"/*.env
unset owner_password app_password csrf_secret mfa_key
echo 'secrets created; tunnel token is still empty'
```

생성 script 자체에는 비밀값이 없으므로 커밋할 수 있습니다. 생성된 `*.env`는 커밋하지 않습니다.

### `infra/scripts/set-tunnel-token.sh`

Tunnel token은 화면에 다시 출력하지 않고 hidden prompt로 저장합니다.

```bash
#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "$0")/../.."
token_file=infra/secrets/tunnel.env
[[ -t 0 ]] || { echo 'interactive terminal required' >&2; exit 1; }
[[ -f "$token_file" ]] || { echo 'initialize secrets first' >&2; exit 1; }
grep -Fxq 'TUNNEL_TOKEN=' "$token_file" || {
  echo 'refusing to replace existing token' >&2
  exit 1
}

read -r -s -p 'Paste the tunnel token, then press Enter: ' token
printf '\n'
[[ ${#token} -ge 100 ]] || { echo 'invalid token length' >&2; exit 1; }
umask 077
printf 'TUNNEL_TOKEN=%s\n' "$token" > "$token_file"
chmod 600 "$token_file"
unset token
echo 'tunnel token saved without displaying it'
```

두 script에 실행 권한을 추가합니다:

```bash
chmod 755 infra/scripts/initialize-secrets.sh
chmod 755 infra/scripts/set-tunnel-token.sh
```

### `infra/scripts/check-secrets.sh`

이 script는 값 자체를 출력하지 않고 파일 권한, placeholder와 필수 key를 검사합니다.

```bash
#!/bin/sh
set -eu

cd -- "$(dirname -- "$0")/../.."
secrets_dir=infra/secrets

fail() { echo "secret preflight failed: $1" >&2; exit 1; }
required() {
  file=$1
  key=$2
  grep -Eq "^${key}=.+" "$file" || fail "$(basename "$file") needs $key"
}

[ -d "$secrets_dir" ] || fail 'secret directory does not exist'
[ "$(stat -c '%a' "$secrets_dir")" = 700 ] || fail 'secret directory must be 700'

for name in compose database migration api web tunnel; do
  file="$secrets_dir/$name.env"
  [ -f "$file" ] || fail "$name.env does not exist"
  [ "$(stat -c '%a' "$file")" = 600 ] || fail "$name.env must be 600"
  grep -Eqi 'replace_with|your_|example_token' "$file" \
    && fail "$name.env contains a placeholder"
done

required "$secrets_dir/compose.env" COMPOSE_PROJECT_NAME
required "$secrets_dir/compose.env" APP_VERSION
required "$secrets_dir/database.env" POSTGRES_DB
required "$secrets_dir/database.env" POSTGRES_USER
required "$secrets_dir/database.env" POSTGRES_PASSWORD
required "$secrets_dir/database.env" APP_DB_USER
required "$secrets_dir/database.env" APP_DB_PASSWORD
required "$secrets_dir/migration.env" MIGRATION_DATABASE_URL
required "$secrets_dir/api.env" DATABASE_URL
required "$secrets_dir/api.env" APP_ORIGIN
required "$secrets_dir/api.env" CSRF_SECRET
required "$secrets_dir/api.env" MFA_ENCRYPTION_KEY
required "$secrets_dir/web.env" API_BACKEND_ORIGIN
required "$secrets_dir/tunnel.env" TUNNEL_TOKEN

grep -Fxq 'COMPOSE_PROJECT_NAME=inventory-portal' \
  "$secrets_dir/compose.env" || fail 'wrong project name'
grep -Fxq 'POSTGRES_DB=inventory_portal' \
  "$secrets_dir/database.env" || fail 'wrong database'
grep -Fxq 'APP_ORIGIN=https://inventory.example.com' \
  "$secrets_dir/api.env" || fail 'wrong application origin'
grep -Eq '^CSRF_SECRET=[0-9a-fA-F]{64,}$' \
  "$secrets_dir/api.env" || fail 'invalid CSRF secret'
grep -Eq '^MFA_ENCRYPTION_KEY=[0-9a-fA-F]{64}$' \
  "$secrets_dir/api.env" || fail 'invalid MFA key'

echo 'secret preflight passed'
```

### `infra/scripts/verify-deployment.sh`

이 script는 local과 public endpoint를 같은 방식으로 검사합니다.

```bash
#!/bin/sh
set -eu

check() {
  label=$1
  url=$2
  result=$(curl --location --fail --silent --show-error \
    --output /dev/null --write-out '%{http_code} %{url_effective}' \
    --max-time 10 --retry 2 "$url") || {
      echo "FAIL $label" >&2
      return 1
    }
  status=${result%% *}
  final_url=${result#* }
  [ "$status" = 200 ] || {
    echo "FAIL $label status=$status" >&2
    return 1
  }
  echo "PASS $label status=$status final=$final_url"
}

check 'local API live' \
  'http://127.0.0.1:4200/api/health/live'
check 'local API ready' \
  'http://127.0.0.1:4200/api/health/ready'
check 'local Web' 'http://127.0.0.1:4101/'
check 'public Web' 'https://inventory.example.com/'
check 'public API ready' \
  'https://inventory.example.com/api/health/ready'
```

실행 권한과 shell syntax를 확인합니다:

```bash
chmod 755 infra/scripts/check-secrets.sh
chmod 755 infra/scripts/verify-deployment.sh
bash -n infra/scripts/*.sh
```

### `.gitignore`

실제 secret과 runtime 자격 증명을 Git에서 제외합니다:

```gitignore
.env
.env.*
!.env.example
infra/secrets/*
!infra/secrets/*.example
infra/runtime/*
!infra/runtime/.gitkeep
*.dump
```

빈 runtime 디렉터리를 유지하고 example env만 커밋합니다:

```bash
mkdir -p infra/runtime infra/secrets
touch infra/runtime/.gitkeep
git check-ignore -v infra/secrets/api.env || true
```

### `.github/workflows/ci.yml`

이 workflow는 application test, production build, Compose parse와 deployment image build를 clean checkout에서 실행합니다.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:16.15-alpine
        env:
          POSTGRES_DB: inventory_portal_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d inventory_portal_test"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 10
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/inventory_portal_test
      TEST_MIGRATION_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/inventory_portal_test
      APP_ORIGIN: http://127.0.0.1:4101
      API_HOST: 127.0.0.1
      API_PORT: 4200
      ATTACHMENT_SCAN_MODE: disabled
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Apply test migrations
        run: npm run db:migrate:test
      - name: Test
        run: npm test
      - name: Build API
        run: npm run build:api
      - name: Build Web
        run: npm run build:web
      - name: Validate Compose model
        run: |
          for file in infra/secrets/*.env.example; do
            cp "$file" "${file%.example}"
          done
          docker compose \
            --env-file infra/secrets/compose.env.example \
            -f infra/compose.production.yml config --quiet
      - name: Build API deployment image
        run: docker build -f apps/api/Dockerfile -t inventory-portal-api:ci .
      - name: Build Web deployment image
        run: docker build -f apps/web/Dockerfile -t inventory-portal-web:ci .
```

test migration script가 없다면 실제 migration 명령으로 교체합니다. CI용 DB와 production DB 이름을 반드시 분리합니다.

### `.github/workflows/availability.yml`

이 workflow는 public readiness를 15분마다 확인합니다.

```yaml
name: Production availability

on:
  workflow_dispatch:
  schedule:
    - cron: '*/15 * * * *'

permissions:
  contents: read

concurrency:
  group: production-availability
  cancel-in-progress: true

jobs:
  ready:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Check public readiness
        run: >-
          curl --fail --silent --show-error
          --max-time 10 --retry 2
          https://inventory.example.com/api/health/ready
```

GitHub Actions 실패 알림의 수신자와 대응 시간을 조직 설정에서 별도로 정합니다. workflow 성공 기록만으로 장애 알림 체계가 완성되지는 않습니다.

## 템플릿 파일을 검증하기

커밋 전에 placeholder, shell syntax, Compose model, image build를 확인합니다:

```bash
rg -n 'inventory-portal|inventory_portal|inventory.example.com|4101|4200' \
  .dockerignore apps infra .github
bash -n infra/postgres/init/10-application-role.sh
bash -n infra/scripts/*.sh
for file in infra/secrets/*.env.example; do
  cp "$file" "${file%.example}"
done
chmod 700 infra/secrets
chmod 600 infra/secrets/*.env
docker compose --env-file infra/secrets/compose.env.example \
  -f infra/compose.production.yml config --quiet
docker build -f apps/api/Dockerfile -t inventory-portal-api:verify .
docker build -f apps/web/Dockerfile -t inventory-portal-web:verify .
```

검증용으로 복사한 `infra/secrets/*.env`는 실제 secret이 아닙니다. 로컬 검증 뒤 삭제하거나 실제 배포 host에서는 `initialize-secrets.sh`가 새 값을 생성하도록 비워 둡니다.

## 최초 배포 실행하기

최초 배포는 읽기 전용 점검부터 시작합니다. 기존 컨테이너를 삭제해 port나 disk를 확보하지 않습니다.

```bash
uname -a
df -h
free -h
docker version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
ss -lnt | grep -E ':(4101|4200)\b' || true
```

충돌이 없으면 CI 통과 SHA를 checkout하고 secret preflight를 실행합니다. 그다음 dependency, migration, application, edge 순서로 시작합니다:

```bash
docker compose --env-file infra/secrets/compose.env \
  -p inventory-portal -f infra/compose.production.yml \
  up -d postgres
docker compose --env-file infra/secrets/compose.env \
  -p inventory-portal -f infra/compose.production.yml \
  run --rm migrate
docker compose --env-file infra/secrets/compose.env \
  -p inventory-portal -f infra/compose.production.yml \
  up -d api web
```

내부 smoke가 성공한 뒤 Tunnel 또는 reverse proxy를 연결합니다. Cloudflare Tunnel을 사용하면 기존 Tunnel을 공유하지 말고 프로젝트 전용 named tunnel과 token을 만듭니다.

public hostname을 연결하기 전에 DNS 충돌을 확인합니다. 같은 hostname의 기존 record가 있으면 자동으로 덮어쓰지 않습니다.

## 배포를 검증하기

자동 smoke와 브라우저 검수를 모두 수행합니다. curl은 client-side redirect, cookie, 키보드 접근, 업무 화면을 검증하지 못합니다.

자동 smoke에는 다음 검사를 포함합니다:

- local API liveness와 readiness
- local Web HTTP 200
- public Web HTTP 200
- public API readiness HTTP 200
- 모든 Compose service의 health 상태
- 최근 로그의 fatal error와 secret 노출 여부
- log driver와 회전 설정

브라우저 검수에는 다음 검사를 포함합니다:

- 비인증 사용자의 로그인 이동
- 로그인, 로그아웃, session cookie, CSRF 동작
- 역할별 첫 화면과 권한 차단
- production origin에서 API 호출
- 대표 create·update 업무 한 건
- 데스크톱과 모바일 viewport
- 첨부가 있으면 정상 파일과 악성 파일 거부

의존성 장애도 검증합니다. 예를 들어 scanner를 중단하면 readiness가 실패하고 첨부 저장도 거부되어야 합니다. 다시 시작한 뒤 readiness가 복구되는지 확인합니다.

검증 결과에는 commit SHA, 실행 시각, endpoint, 기대 결과, 실제 결과, 미검증 항목을 기록합니다. password, token, 내부 IP, cookie는 기록하지 않습니다.

## 재배포 절차를 고정하기

재배포는 다음 순서를 사용합니다:

1. 변경 내용과 DB migration 유무를 확인합니다.
2. CI가 통과한 target SHA를 기록합니다.
3. 현재 실행 SHA와 volume 목록을 기록합니다.
4. DB backup과 복원 가능 상태를 확인합니다.
5. 서버 repository를 `git pull --ff-only`로 갱신합니다.
6. application image를 새 SHA tag로 build하거나 registry에서 pull합니다.
7. migration을 한 번 실행합니다.
8. API와 Web을 교체합니다.
9. local과 public smoke를 실행합니다.
10. 브라우저 대표 흐름을 확인하고 release를 기록합니다.

`git pull` 전에 server-only secret과 runtime 파일이 Git 추적 대상이 아닌지 확인합니다. 서버에서 source를 직접 수정하지 않습니다.

Compose 전체를 내릴 필요가 없으면 변경된 service만 교체합니다. DB와 volume을 불필요하게 중단하지 않습니다.

## 롤백을 준비하기

application rollback과 DB rollback을 분리합니다. 이전 image를 다시 실행해도 새 migration이 과거 app과 호환되지 않으면 rollback은 실패합니다.

application rollback 절차는 다음과 같습니다:

1. 장애 시각과 현재 release SHA를 기록합니다.
2. 외부 트래픽 또는 변경 가능한 기능을 중단합니다.
3. 이전에 검증한 image tag와 환경 변수 contract를 확인합니다.
4. 이전 API와 Web image를 실행합니다.
5. local과 public smoke를 다시 실행합니다.
6. 데이터 정합성과 누락된 background job을 확인합니다.

DB migration은 expand-and-contract 방식을 권장합니다. 먼저 새 column이나 table을 추가하고, app 전환 뒤 데이터를 이관하고, 이전 app이 더 이상 필요 없을 때 제거합니다.

파괴적 migration에는 별도 승인과 복원 지점이 필요합니다. 자동 down migration만으로 안전한 데이터 복원이 보장되지 않습니다.

다음 명령은 운영 runbook에서 금지합니다:

```bash
docker compose down -v
docker volume prune
docker system prune --volumes
```

disk 부족을 해결하려고 다른 프로젝트의 image, container, volume을 삭제하지 않습니다. 정확한 소유자와 rollback 필요성을 확인한 뒤 별도 승인으로 처리합니다.

## 백업과 복원을 운영 절차로 만들기

백업 파일 생성은 복구 가능성을 증명하지 않습니다. 별도 DB에 복원하고 schema, row count, 핵심 정합성 query를 비교해야 합니다.

새 프로젝트에서 확정할 항목은 다음과 같습니다:

| 항목 | 결정 내용 |
|---|---|
| RPO | 허용 가능한 데이터 손실 시간 |
| RTO | 서비스 복구까지 허용 가능한 시간 |
| 방식 | `pg_dump`, base backup와 WAL archive, managed backup 등 |
| 주기 | full backup과 incremental·WAL 보관 주기 |
| 보관 | 일·주·월 단위 보존 기간과 암호화 |
| 위치 | 운영 host 장애와 분리된 저장소 |
| 검증 | 자동 restore와 업무 정합성 비교 주기 |
| 담당 | 실패 alert 수신자와 복구 승인자 |

B2B-STM의 `scripts/rehearse-backup-restore.mjs`는 개발 DB를 임시 DB에 복원하는 리허설입니다. 현재 Compose와 workflow에는 production 자동 backup job이 없고 별도 복원 환경의 최종 RPO/RTO도 측정하지 않았습니다. 새 프로젝트는 이 부분을 구현 완료로 간주하면 안 됩니다.

## 로그·모니터링·알림을 연결하기

health check는 상태를 계산하고 monitor는 실패를 발견하며 alert는 담당자에게 전달합니다. 세 가지를 각각 구성합니다.

최소 감시 항목은 다음과 같습니다:

- public readiness 실패와 응답 시간
- API 5xx 비율과 주요 오류 분류
- DB 연결 실패, connection pool 고갈, migration 실패
- disk·memory·CPU·container restart 횟수
- backup 실패와 마지막 성공 시각
- queue 지연과 영구 실패 건수
- TLS·도메인 만료와 Tunnel 연결 상태
- ClamAV를 사용하면 signature 갱신 실패와 scan 장애

B2B-STM의 availability workflow는 15분마다 public readiness를 확인합니다. workflow 실패를 누가 어떤 채널에서 받는지까지 정해야 실제 알림이 됩니다.

application 로그에는 request ID, actor ID, 업무 대상 ID, status, duration, 오류 분류를 남깁니다. password, token, cookie, 원문 첨부, 전체 연결 URL은 기록하지 않습니다.

## 메일과 background worker를 안전하게 켜기

메일 발송을 나중에 활성화할 때 transport와 worker를 따로 보지 않습니다. B2B-STM은 메일이 없을 때 `MAIL_TRANSPORT=disabled`와 `NOTIFICATION_WORKER_ENABLED=false`를 함께 사용합니다.

SMTP 전환은 다음 순서로 진행합니다:

1. SMTP credential과 발신 주소를 secret에 저장합니다.
2. 테스트 수신자에게 연결과 발신 정책을 검증합니다.
3. 기존 outbox의 대기·실패 건수를 확인합니다.
4. 과거 알림의 일괄 발송 여부를 결정합니다.
5. transport를 `smtp`로 바꾸고 worker를 활성화합니다.
6. 중복 방지, retry, 영구 실패와 alert를 확인합니다.

worker만 먼저 켜면 누적된 outbox가 한꺼번에 발송될 수 있습니다. 운영 전환 기록에 대기 건수와 처리 결정을 남깁니다.

## 보안 점검을 완료하기

운영 전 다음 경계를 확인합니다:

- host port는 필요한 service만 `127.0.0.1`에 binding
- DB와 내부 service는 public network에 미연결
- container는 가능한 경우 non-root 사용자로 실행
- production은 HTTPS origin과 secure cookie 사용
- CSRF secret과 암호화 key는 서로 다른 값 사용
- app DB 역할은 schema 변경 권한 없음
- secret 파일은 Git, image layer, 로그에 미포함
- dependency와 base image 취약점 갱신 절차 존재
- 관리자 bootstrap password는 hidden prompt에서만 입력
- MFA 또는 동등한 관리자 추가 인증 검증
- 공개 health 응답에 내부 구성 미노출

Cloudflare Access 같은 edge 인증을 추가하더라도 application 인증과 권한 검사는 유지합니다. edge 정책은 내부 service 호출이나 잘못된 route 노출을 완전히 대신하지 않습니다.

## 자주 발생하는 실패를 진단하기

| 증상 | 가능한 원인 | 확인·조치 |
|---|---|---|
| CI는 성공했지만 image build 실패 | Dockerfile이 local 산출물이나 `.env.local`에 의존 | clean checkout에서 build, `COPY` 목록 수정 |
| API가 시작 직후 종료 | production 필수 환경 변수 누락 | config error와 `check-secrets.sh` 결과 확인 |
| DB는 healthy인데 API readiness 실패 | app role privilege 또는 migration 누락 | migration 결과, grant, API 로그 확인 |
| init script 수정이 반영되지 않음 | 기존 PostgreSQL volume 사용 | 기존 DB에 검토한 SQL을 별도 적용 |
| Web은 열리지만 `/api`가 실패 | build-time backend origin 누락 또는 network 불일치 | Web build arg, rewrite, Compose network 확인 |
| public만 실패 | DNS, Tunnel token, hostname route 오류 | local smoke 후 Tunnel 상태와 DNS 확인 |
| scanner 시작이 오래 걸림 | 최초 signature download와 health start period 부족 | 로그 확인 후 현실적인 start period 설정 |
| 재배포 후 과거 app으로 rollback 불가 | 파괴적 migration 또는 환경 변수 contract 변경 | expand-and-contract와 이전 image smoke 도입 |
| disk가 빠르게 증가 | 무제한 container 로그, image 누적, backup 보관 실패 | log rotation과 소유 대상별 보관 정책 적용 |
| availability workflow만 실패 | public endpoint 일시 장애 또는 runner network 문제 | 같은 시각의 server 로그와 다른 위치 점검 비교 |

## 프로젝트 이식 완료 체크리스트

### 설계와 격리

- [ ] project slug, port, DB명, 역할명, hostname이 다른 프로젝트와 겹치지 않는다
- [ ] 장기 service와 일회성 migration·seed job을 분리했다
- [ ] 공개, backend, egress network 경계를 정했다
- [ ] named volume의 소유 프로젝트와 삭제 금지 규칙을 기록했다

### image와 CI

- [ ] API와 Web production image가 clean checkout에서 build된다
- [ ] runtime container가 non-root로 실행된다
- [ ] CI가 build, test, Compose parse, image build를 실행한다
- [ ] 배포 SHA와 CI 성공 SHA를 대조한다
- [ ] base image digest 갱신 절차와 담당자를 정했다

### 비밀값과 DB

- [ ] service별 env 파일을 분리했다
- [ ] secret 디렉터리 `700`, 파일 `600`을 검사한다
- [ ] placeholder와 필수 key를 자동 검사한다
- [ ] migrator와 app DB 역할을 분리했다
- [ ] migration과 seed의 재실행 무변경을 확인했다

### 실행과 검증

- [ ] local live, ready, Web이 성공한다
- [ ] public Web과 API readiness가 성공한다
- [ ] 인증, 권한, 대표 쓰기 업무를 브라우저에서 확인했다
- [ ] 의존성 장애와 복구를 검증했다
- [ ] commit SHA, 결과, 미검증 항목을 기록했다

### 운영과 복구

- [ ] 이전 application image로 rollback을 리허설했다
- [ ] migration 하위 호환과 파괴적 변경 승인 기준이 있다
- [ ] 별도 환경에서 backup restore를 검증했다
- [ ] RPO와 RTO를 측정하고 기록했다
- [ ] 로그 회전, 외부 monitor, 담당자 alert를 연결했다
- [ ] `down -v`와 광범위 prune을 운영 runbook에서 금지했다

## 이 문서 하나만 전달하기 전 확인

수신자는 별도 저장소 문서 없이 이 파일의 템플릿과 절차만 사용하면 됩니다. 전달자는 다음 항목만 확인합니다:

- [ ] 문서 안의 `inventory-portal`, `inventory_portal`, hostname과 port가 예시임을 알린다
- [ ] 실제 password, token, cookie, DB dump를 문서에 추가하지 않는다
- [ ] 대상 application의 build·start·migration·test 명령을 함께 알려준다
- [ ] Cloudflare를 사용하지 않으면 Tunnel 부분을 제외한다고 알린다
- [ ] ClamAV가 필요 없으면 관련 service·환경 변수·readiness 의존성을 함께 제거한다고 알린다
- [ ] 실제 RPO, RTO, backup 저장소와 alert 담당자는 대상 프로젝트에서 확정한다

문서에는 배포 파일 전체 템플릿, 생성 순서, 검증 명령, 최초 배포, 재배포, 롤백, backup·복원, 관측성, 보안과 완료 체크리스트가 포함돼 있습니다. 외부 문서 링크나 B2B-STM 저장소 접근은 필수가 아닙니다.
