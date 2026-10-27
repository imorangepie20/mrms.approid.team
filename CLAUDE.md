@AGENTS.md

# Claude Code 작업 안내

위 `AGENTS.md`가 작업 규칙의 원본이다. 이 문서는 Claude Code가 저장소를 빨리 파악하도록 구조·명령·주의점만 덧붙인다. 규칙이 충돌하면 `AGENTS.md`와 `docs/project-rules/`를 따른다.

## 시스템 구성

TIDAL 사용자의 플레이리스트로 취향을 분석해 추천하는 웹 서비스다. 추천 도메인은 세 공간으로 나뉜다.

- **EMS** (External Music Space): 외부에서 들여온 트랙·플레이리스트 카탈로그. 추천 후보의 원천이다.
- **GMS** (Gateway Music Space): 특정 사용자에게 추천된 트랙. 사용자가 좋아함/좋아하지 않음을 결정한다.
- **MMS** (My Music Space): 사용자 취향 공간. 처음에는 TIDAL 플레이리스트로 시작한다. 좋아하지 않음으로 결정한 트랙은 해당 사용자의 MMS와 이후 GMS 후보에서 영구 제외한다(EMS 원본은 유지).

| 경로 | 역할 | 스택 |
| --- | --- | --- |
| `apps/web` | 사용자 웹 + 모든 API(`src/app/api/**/route.ts`) + `/admin` 호스팅 | Next.js 16, React 19, TypeScript, Tailwind 4, Auth0, `pg`, `@tidal-music/player`, Vitest |
| `apps/admin` | 관리자 SPA(`hud-admin-template` 기반). 빌드 결과를 `apps/web/public/admin`에 넣고 `src/app/(admin)/admin/[[...slug]]/page.tsx`가 로드한다. 일반 화면(`src/app/(site)`)과 관리자(`src/app/(admin)`)는 root layout이 따로라 둘 사이 이동은 전체 문서 로드다 | React 18, Vite, react-router, Vitest |
| `services/ems-pipeline` | EMS 수집·선정·임베딩·오디오 분석 worker, 소스 루틴(Melon·Spotify charts·MusicBrainz·TIDAL) | Python 3.12, CLI `python -m ems_pipeline.cli <command>`, pytest |
| `services/embedding` | 트랙 임베딩 HTTP 서비스(`/v1/embeddings`) | Python, FastAPI |
| `services/audio-analysis` | 30초 프리뷰 오디오 분석 서비스 | Python 3.12, FastAPI, pytest |
| `infra/compose.zorin.yml` | Zorin 홈서버 운영 구성(postgres+pgvector, 위 서비스, web, migrate, cloudflared tunnel) | Docker Compose |

`apps/web/src/lib/` 주요 영역: `tidal`(인증·카탈로그·재생), `auth`(Auth0·관리자 접근 정책·토큰 암호화), `db`(쿼리와 `migrations/`), `ems`, `recommendations`, `embeddings`, `audio-analysis`, `mms`, `likes`, `musicbrainz`.

## 자주 쓰는 명령

각 앱·서비스 디렉터리에서 실행한다. 루트에는 workspace 설정이 없다.

```bash
cd apps/web && npm test          # vitest run
cd apps/web && npm run lint
cd apps/web && npx tsc --noEmit
cd apps/web && npm run build
cd apps/admin && npm test
cd apps/admin && npm run build   # tsc -b && vite build
cd services/ems-pipeline && python -m pytest
cd services/audio-analysis && python -m pytest
```

- Python 서비스는 의존성이 설치된 환경에서 실행한다(예: `pip install -e ".[test]"`). 2026-10-27 로컬 확인 기준으로 ems-pipeline은 121개 테스트가 수집되고, audio-analysis는 `fastapi` 미설치로 수집 오류가 난다.
- 단일 테스트: `npx vitest run src/lib/ems/<file>.test.ts`, `python -m pytest tests/<file>.py -k <name>`.
- DB 마이그레이션: `apps/web/scripts/migrate.mjs`가 `apps/web/src/lib/db/migrations/NNN_*.sql`을 순서대로 적용한다(advisory lock, sha256 checksum). 운영에서는 compose `migrate` 서비스(`profiles: [tools]`)로 실행한다.

## 주의점

- **Next.js 16**: 학습 데이터와 API가 다를 수 있다. 코드를 쓰기 전에 `apps/web/node_modules/next/dist/docs/`의 해당 가이드를 확인한다(`apps/web/AGENTS.md`). 이 파일은 `next dev`가 다시 만들기 때문에 diff에서 지우지 않는다.
- **마이그레이션은 불변**: 적용된 파일을 수정하면 checksum 불일치로 실패한다. 변경은 다음 번호의 새 파일과 짝이 되는 `.down.sql`로 추가한다.
- **관리자 화면**: 관리자 API는 `apps/web/src/app/api/admin/**`에 있고, 접근 분리는 `src/lib/auth/access-policy.ts`·`admin.ts`가 담당한다. 관리자 UI 수정은 `apps/admin`의 기존 템플릿 컴포넌트를 먼저 쓴다.
- **운영 환경**: 배포 대상은 Zorin 서버의 `/home/approid/apps/music-pie`다. 비밀값은 `shared/secrets/*.env`에 있고 저장소에 넣지 않는다. 배포·원격 명령·`docker compose down -v`·migration down은 사용자가 요청할 때만 실행한다. 절차는 `docs/runbooks/ems-catalog-ingestion.md`와 최근 `docs/changes/*deploy*.md`를 따른다.
- **TIDAL 호출 경계**: Web 요청 경로에서 메타데이터 backfill용 TIDAL 조회를 하지 않는다. backfill은 ems-pipeline 명령(`backfill-tidal-metadata` 등)이 담당한다.
- **작업 트리**: 사용자가 만든 미커밋·미추적 파일(특히 `docs/changes`, `docs/plans`)이 자주 있다. 커밋할 때는 이번 작업 파일만 stage한다.

## 작업 기록 흐름

1. `docs/README.md` → `docs/overview/current-development-context.md`로 현재 상태와 최근 배포 커밋을 확인한다.
2. 다단계 작업은 `docs/plans/YYYY-MM-DD-<slug>.md`에 계획을 쓴다.
3. 완료 후 `docs/changes/YYYY-MM-DD-<slug>.md`에 이유·변경·검증 결과·미검증·다음 작업을 기록하고 `docs/README.md` 인덱스와 `current-development-context.md`를 갱신한다.
4. 큰 설계는 `docs/superpowers/specs/`·`docs/superpowers/plans/`, 결정은 `docs/decisions/`에 둔다.

## Claude Code 스킬 매핑

설치·노출 상태는 `docs/harness/skill-plugin-environment.md`에 기록되어 있다. 하네스 5절의 절차 스킬은 다음으로 쓴다.

| 상황 | 스킬 |
| --- | --- |
| 기능 설계·범위 정리 | `superpowers:brainstorming` |
| 다단계 계획·실행 | `superpowers:writing-plans`, `superpowers:executing-plans` |
| 동작 변경·버그 수정 | `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `investigate-first` |
| 완료 보고 전 | `superpowers:verification-before-completion` |
| 변경 범위 통제 | `karpathy-guidelines` |
| UI 작업 | `ui-ux-pro-max`, `frontend-design:frontend-design`, `web-design-guidelines`, `vercel-react-best-practices` |
| 하네스 점검·회고 | `harness:harness`, `harness:evolve` |
