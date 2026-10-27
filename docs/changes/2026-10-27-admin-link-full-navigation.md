# 관리자 진입 시 일반 사이드 메뉴 잔존 수정(root layout 분리)

## 이유

일반 페이지의 `관리자` 링크로 `/admin`에 들어가면 일반 사이드 메뉴(`AppNavigation`)가 관리자 화면 왼쪽에 남았다.

## 원인

root layout(`apps/web/src/app/layout.tsx`)이 하나뿐이었고, 요청 헤더 `x-music-pie-pathname`으로 관리자 경로를 판별해 일반 셸(사이드 메뉴·플레이어)을 뺐다. `AuthControls`의 관리자 링크는 `next/link`라 클라이언트 이동이 일어나는데, 클라이언트 이동에서는 root layout이 다시 렌더링되지 않아 일반 셸이 그대로 남았다. `/admin`을 직접 열거나 새로고침하면 정상이었다.

## 변경

Next.js route group으로 root layout을 둘로 나눴다. 서로 다른 root layout 사이 이동은 Next.js가 항상 전체 문서 로드로 처리한다(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`).

- `src/app/(site)/`: 기존 `layout.tsx`·`page.tsx`와 `account`·`ems`·`gms`·`mms`·`onboarding`·`search`·`tidal-connection`·`visualizer`를 이동했다. layout에서 헤더 기반 관리자 분기를 지웠다.
- `src/app/(admin)/layout.tsx`: 관리자 전용 root layout(일반 셸 없음)을 추가했다. 기존 인증 게이트 `src/app/(admin)/admin/layout.tsx`와 SPA 로더 `page.tsx`는 위치만 옮겼다.
- `globals.css`·`styles/`·`api/`·`favicon.ico`는 `src/app`에 그대로 두었다. 두 root layout 모두 `globals.css`를 불러와 관리자 화면의 기존 스타일 조건을 유지한다.
- 관리자 분기 테스트를 `src/app/(admin)/layout.test.tsx`로 옮기고 `(site)/layout.test.tsx`에서는 지웠다.
- URL은 바뀌지 않는다. `src/proxy.ts`의 `x-music-pie-pathname` 헤더는 관리자 인증 게이트의 `returnTo` 계산에 계속 쓴다.

## 검증

- `npx vitest run`: 146 파일 통과, 5 skipped(610 tests 통과, 9 skipped)
- `npm run lint`: error 0(warning 8은 이번 변경과 무관한 기존 항목)
- `npm run build`, `npx tsc --noEmit` 통과. 이전 경로를 가리키던 `next dev` 생성 타입 `.next/dev`는 지우고 다시 빌드했다.
- 로컬 `next start`(3123 포트): `/`·`/ems`는 200으로 사이드 메뉴·전역 플레이어 포함, 비로그인 `/admin`은 307 → `/api/auth/login?returnTo=%2Fadmin`, 없는 경로는 404

## 동작 차이

- 없는 경로의 404 화면은 전에는 일반 셸 안에 나왔지만, 이제는 Next.js 기본 404 화면만 나온다(전역 root layout이 없기 때문). 필요하면 `experimental.globalNotFound`와 `global-not-found.tsx`로 따로 꾸민다.

## 미검증

- 관리자 계정으로 로그인한 브라우저에서 `관리자` 링크를 클릭해 확인하지 않았다.

## 운영 배포(2026-10-27)

사용자 요청으로 커밋 `57b7ec434848f9ef89ffb845839a06bdbe034510`을 push한 뒤 Zorin Web만 교체했다. 직전 배포 `6b19816` 이후 코드 변경은 `apps/web/src/app`뿐이라 migration·다른 서비스 교체는 없다.

- source: `git archive 57b7ec4`, 6,737,920bytes, SHA-256 `0792c0a0a3dfca9d375861fce49a20e60f06beccfadcc3694236282d3713183f`
- release: `/home/approid/apps/music-pie/releases/20261027-admin-layout-57b7ec4`(`current` symlink는 기존 그대로)
- image `music-pie-web:admin-layout-57b7ec4`, label revision·source-sha256 일치. override `shared/compose.admin-layout.yml`을 기존 `compose.zorin.yml`·`compose.musicbrainz-ssd.yml`·`compose.kpop-sections.yml` 뒤에 추가하고 `up -d --no-deps --no-build --force-recreate --pull never web`
- 결과: healthy·restart 0, 내부 `/`·`/ems` 200(일반 셸 포함), `/admin` 307 → 로그인, 없는 경로 404, readiness 200, 최근 5분 Web 로그 error 0. 공개 `https://mrms.approid.team`의 `/` 200, `/admin` 307, readiness 200
- 비-Web container 6개 ID 전후 동일
- rollback: 이전 image `sha256:56ff14d257cb426c0473c50653e5376c7e2b31766cb2c10593b6e6f3517bd2b2`, tag `music-pie-web:pre-admin-layout-20261027`. `shared/compose.admin-layout.yml`을 빼고 같은 방식으로 web만 다시 올리면 된다.
- 서버 증거: `shared/artifacts/20261027-admin-layout-57b7ec4/`(build/deploy/verify scripts, `web-build.log`, `nonweb-before/after.txt`, `rollback-image.txt`, `verification.txt`)

## 미검증(배포 후)

- 관리자 계정으로 로그인한 운영 브라우저에서 `관리자` 링크 클릭 이동은 확인하지 않았다.

## 참고

- 배포 전 inventory에서 `music-pie-ems-source-routines-1`(image `music-pie-ems-pipeline:ssd-storage-20261009`)이 `Exited (127)` 상태로 2일째 멈춰 있었다. 이번 작업 범위 밖이라 건드리지 않았다.
