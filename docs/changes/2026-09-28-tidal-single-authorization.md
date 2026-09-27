# TIDAL 최초 연결과 전체 재생 승인 통합

## 변경 이유

- 온보딩의 `TIDAL 연결하기`는 플레이리스트용 일반 OAuth를 먼저 실행했지만 전체 재생은 별도 Device 세션을 요구했다.
- 그 결과 사용자가 TIDAL 연결 시 한 번, 첫 스트리밍 시 다시 한 번 승인해야 했다.

## 구현

- 온보딩의 연결 진입점을 일반 OAuth API에서 `/tidal-connection` 통합 관문으로 교체했다.
- 최초 연결은 기존 Device authorization API를 사용해 플레이리스트 조회와 전체 재생에 쓰는 단일 세션을 저장한다.
- 연결 관문은 단순 `status=connected`가 아니라 재생 가능한 Device scope 보유까지 확인한다.
- Device scope가 이미 저장된 사용자는 승인 버튼을 표시하지 않고 원래 요청한 화면으로 바로 계속한다.
- 이전 일반 OAuth 연결만 남은 사용자는 통합 관문에서 한 번 승인하면 이후 재승인을 요구하지 않는다.
- 일반 OAuth route는 이전 callback 호환을 위해 유지하지만 사용자 화면에서는 더 이상 진입하지 않는다.

## 검증

- 연결 관문·Device 승인·온보딩 focused Vitest 4개 파일, 8개 테스트를 통과했다.
- 전체 Web Vitest는 107개 파일 중 105개, 415개 테스트 중 412개가 통과했다. 기존 추천 결정 mock 1건과 좋아요 mock 2건의 HTTP 503 기대 불일치 3건은 이번 변경과 무관하게 남아 있다.
- ESLint는 오류 0건, 기존 경고 5건이며 Next.js production build와 TypeScript를 통과했다.
- 운영 Docker Web build와 loopback readiness 200, container health `healthy`를 확인했다.
- 운영 로그인 세션에서 `/tidal-connection`이 `TIDAL 연결됨`으로 표시되고 승인 버튼 없이 MMS continuation을 제공했다.
- 온보딩의 연결 버튼이 `/tidal-connection?returnTo=/onboarding?tidal=connected`로 이동하는 것을 확인했다.
- MMS 실제 트랙은 추가 승인 UI 없이 `0:02/4:32`까지 재생됐고 browser error는 0건이었다.

## 배포와 rollback

- 배포 release는 `/home/approid/apps/music-pie/releases/f930cbf`, Web image는 `sha256:99ea67a3b7d2...`다.
- 배포 전 release `/home/approid/apps/music-pie/releases/e58e606`과 image `music-pie-web:pre-tidal-single-auth-f930cbf`를 rollback 대상으로 보존했다.
- Web만 재생성했다. EMS pipeline과 source-routines의 container ID·image·시작 시각은 유지됐고 DB schema와 사용자 데이터 변경은 없다.
- token, cookie, Device code와 provider 원문 응답은 로그·문서·저장소에 기록하지 않았다.

## 미검증 항목

- 현재 로그인 계정의 유효한 Device 세션을 해제하지 않기 위해 운영에서 신규 미연결 계정의 실제 TIDAL 승인 완료는 실행하지 않았다. 시작·poll·저장·완료 이동은 route와 컴포넌트 테스트로 검증했다.
