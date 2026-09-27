# 관리자 공통 셸 반응형 레이아웃 수정

## 문제

- 관리자 셸은 모든 viewport에서 256px fixed sidebar를 본문 폭에서 차감한다.
- 내부 페이지의 `md`·`lg`·`xl` breakpoint는 전체 viewport를 기준으로 적용되어 실제 본문 가용 폭과 어긋난다.
- 그 결과 중간 폭에서 여러 관리자 페이지의 헤더·필터·표가 오른쪽 경계에 붙거나 잘린다.

## 변경

- 1536px 미만에서는 sidebar를 본문 폭 밖의 off-canvas drawer로 전환한다.
- 1536px 이상에서만 sidebar가 본문 폭을 점유하고 desktop 접기 상태를 적용한다.
- 닫힌 drawer는 `aria-hidden`을 적용하고 내부 탐색 요소를 렌더하지 않아 focus 대상에서 제외한다.
- main·header에 공통 축소 경계를 두고 page-level overflow를 차단하되 표의 내부 스크롤은 유지한다.
- Docker context에서 커밋된 관리자 산출물을 제외해 container build의 최신 자산만 복사하고, Next 진입 페이지는 JS·CSS가 각각 정확히 1개인지 검증한다.

## 검증

- 관리자 Vitest, lint, production build와 Web production build를 실행한다.
- 운영 배포 후 Tracks·Spotify·Statistics를 1024px, 1272px, 1536px에서 확인한다.
- 각 화면에서 document overflow 0, header·액션 잘림 0, 표 내부 overflow 격리와 console error 0을 확인한다.

## 결과

- 구현은 `635aa7c`, stale asset 차단은 `7032b1f`에 반영했다.
- 운영 1024px drawer, 1272px 핵심 10개 경로, 1536px persistent sidebar를 검증했고 document overflow와 console error는 0건이다.
- container의 관리자 JS·CSS는 각각 1개이며 최신 해시 자산이 실제 browser에 로드됐다.
