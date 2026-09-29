# 회원가입 뒤 플레이리스트 온보딩 복귀 수정

## 변경 이유

메인의 `회원가입`은 Auth0 가입 화면만 열고 가입 완료 뒤 목적지를 전달하지 않았다. 일반 회원은 Auth0 콜백 뒤 TIDAL 연결 화면을 거치지만, 목적지가 없으므로 Device 승인 완료 뒤 홈으로 돌아갔다. 그 결과 신규 사용자가 플레이리스트 선택 단계에 자동으로 도달하지 못했다.

## 변경 내용

- 익명 사용자용 회원가입 링크에 `returnTo=/onboarding?tidal=connected`를 추가했다.
- 기존 `/api/auth/signup` 호환 redirect도 같은 가입 목적지를 사용한다.
- TIDAL이 이미 연결된 확인 화면의 `플레이리스트 가져오기` 링크를 `/onboarding?tidal=connected`로 통일했다.
- 일반 로그인, 관리자 callback, same-origin `returnTo` 검증과 TIDAL 권한·토큰 저장 경계는 변경하지 않았다.

## 검증 결과

- 수정 전 관련 4개 파일·9개 테스트 중 4개가 실패했고, 수정 뒤 모두 통과했다.
- 확장 회귀 8개 파일·28개 테스트가 통과했다.
- Web 전체 144개 파일 중 141개 통과·3개 skip, 총 551개 테스트 중 548개 통과·3개 skip이다.
- ESLint 오류 0개이며 기존 경고 6개만 남았다.
- production build와 TypeScript, 52개 route 생성을 통과했다.
- 코드 검토와 인증·redirect 보안 검토에서 수정 필요 사항이 없었고 `git diff --check`를 통과했다.

## 운영 배포

- 기능 커밋 `d5d6314`를 `origin/main`에만 push했다. 기능 브랜치는 원격으로 push하지 않았다.
- release archive는 6,348,800바이트, SHA-256 `2ef32f3a75ea655549f22f39f196db3330cb4a2e02b79689ccb1ba9787251ff6`이며 Zorin release는 `/home/approid/apps/music-pie/releases/d5d6314`다.
- Web image는 `sha256:6bdca7d395ad204bd678c9f4b998e80e272e886c762fcc0f40bb703de1d5be1f`, container는 `9162fad6df0e`이고 healthy·restart 0이다.
- rollback image `music-pie-web:pre-signup-onboarding-d5d6314`는 `sha256:4e6d69a0f145a2af9eadaf2f3621634d635698c09d55dcd2f39f5167c8643b0c`다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `70208048b7c2`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았고 모두 restart 0이다.
- local/public readiness와 공개 메인은 HTTP 200이다. 공개 메인 HTML의 가입 href, legacy 307 redirect, Auth0 authorize의 `screen_hint=signup`과 transaction state 보존, 최근 10분 Web 오류 0건을 확인했다.
- 운영 브라우저에서 연결 완료 화면의 `플레이리스트 가져오기`가 `/onboarding?tidal=connected`를 가리키고, 해당 화면에서 실제 TIDAL 플레이리스트 목록이 로드되는 것을 확인했다.

## 미검증·다음 작업

- 실제 신규 Auth0 계정 생성과 새 계정의 TIDAL Device 승인은 외부 계정 상태를 변경하므로 수행하지 않았다.
- 신규 사용자의 실전 회원가입부터 Device 승인까지 전체 브라우저 흐름은 다음 실제 가입 때 확인한다.
