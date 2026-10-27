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
- 배포하지 않았다.
