# 관리자 공통 셸 반응형 레이아웃 수정

## 변경 이유

- 관리자 sidebar가 모든 viewport에서 256px를 점유하지만 내부 페이지 breakpoint는 전체 viewport를 기준으로 적용돼, 중간 폭에서 헤더·필터·표가 오른쪽에 붙거나 잘렸다.
- Docker image에 커밋된 관리자 자산과 container build 자산이 함께 남아 Next 진입 페이지가 이전 해시 JS를 선택할 수 있었다.

## 구현

- `635aa7c`에서 1536px 미만 sidebar를 본문 폭 밖의 off-canvas drawer로 전환했다. 1536px 이상에서만 persistent sidebar와 256px/80px 접기 상태를 적용한다.
- 닫힌 drawer는 내부 탐색 요소를 렌더하지 않고, 배경 클릭과 경로 이동에서 닫는다. header·main은 공통 축소 경계와 page-level overflow 제한을 사용한다.
- `7032b1f`에서 `apps/web/public/admin`을 Docker context에서 제외해 container build의 최신 관리자 자산만 image에 넣는다.
- Next 관리자 진입 페이지는 JS와 CSS 후보가 각각 정확히 1개가 아니면 실패해 오래된 자산을 임의 선택하지 않는다.

## 검증

- 관리자 Vitest 7개 통과, lint 오류 0건이며 기존 template 경고는 38개다.
- 관리자와 Web production build, Web 관리자 진입·배포 설정 테스트 6개를 통과했다.
- 운영 1024px에서 sidebar 닫힘 시 main은 전체 폭, 열림 시 sidebar는 0–256px overlay이며 document 폭은 변하지 않았다.
- 운영 1272px에서 Overview, Tracks, Statistics, Ingestion, Melon, URL imports, Spotify, Routines, Home screen, EMS screen 10개 경로 모두 `scrollWidth=clientWidth`, `mainLeft=0`, `mainRight=headerRight=clientWidth`였다.
- 운영 1536px에서 expanded sidebar/main은 256px/나머지 폭, collapsed는 80px/나머지 폭이며 document overflow는 0이다.
- 실제 로드 자산은 `index-DXIwYzFO.js`, `style-DqoYxrcf.css` 각 1개이고 browser console error는 0건이다.

## 배포와 rollback

- 최종 release는 `/home/approid/apps/music-pie/releases/7032b1f`, Web image는 `sha256:e3ae9e5adbcbb...`다.
- 배포 전 image는 `music-pie-web:pre-admin-shell-635aa7c`, 중간 image는 `music-pie-web:pre-admin-asset-cleanup-7032b1f`로 보존했다.
- Web만 재생성했다. EMS worker와 source-routines의 container ID·image·시작 시각은 유지됐고 DB 변경은 없다.

## 미검증 항목

- EMS 운영 핵심 10개 경로 외 template 예제 화면은 개별 시각 검증하지 않았다. 모든 경로가 같은 `MainLayout`을 사용해 공통 폭 수정은 적용된다.
