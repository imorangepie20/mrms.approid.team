# 메인 회원가입 링크 수정

## 변경 이유

메인의 익명 사용자용 `회원가입` 링크가 `/api/auth/signup`을 가리키고 있었다. 이 route handler는 reverse proxy 뒤 운영 요청의 내부 원본 origin을 사용해 `https://0.0.0.0:3000/api/auth/login?screen_hint=signup`으로 redirect했고, 사용자가 공개 서비스에서 가입 화면에 진입할 수 없었다.

## 변경 내용

- 메인 전역 내비게이션의 `회원가입` 링크를 Auth0 SDK의 가입 진입 계약인 `/api/auth/login?screen_hint=signup`으로 직접 연결했다.
- 기존 `/api/auth/signup`은 오래된 링크 호환을 위해 host에 의존하지 않는 상대 `Location: /api/auth/login?screen_hint=signup`으로 307 redirect한다.
- 컴포넌트, 루트 레이아웃, legacy route handler 테스트에서 링크와 redirect 계약을 고정했다.

## 검증 결과

- 수정 전 회귀 테스트는 메인 링크와 legacy redirect 두 경계에서 실패했고, 수정 후 관련 3개 파일·7개 테스트가 통과했다.
- Web 전체 144개 파일 중 141개 통과·3개 skip, 총 551개 테스트 중 548개 통과·3개 skip이다.
- 현재 checkout의 누락된 `lucide-react`를 lockfile 변경 없이 설치 상태에만 복구한 뒤 전체 테스트를 재실행했다.
- ESLint 오류 0개이며 기존 경고 6개만 남았다.
- production build와 TypeScript를 통과했고 `/api/auth/signup`을 포함한 52개 page 생성을 확인했다.
- `git diff --check`를 통과했다.

## 운영 배포

- 기능 커밋 `63f25ee`를 `origin/main`에만 push했다. 기능 브랜치는 원격으로 push하지 않았다.
- release archive는 6,338,560바이트, SHA-256 `aa97cbd6f12785d7cca4a542ffcfe438b2d036efda9e21a56a1593dcf6eafe9f`이며 Zorin release는 `/home/approid/apps/music-pie/releases/63f25ee`다. 서버 incoming archive는 배포 후 제거했다.
- Web image는 `sha256:4e6d69a0f145a2af9eadaf2f3621634d635698c09d55dcd2f39f5167c8643b0c`, container는 `78b4e806f2f1`이고 healthy·restart 0이다.
- rollback image `music-pie-web:pre-home-signup-63f25ee`는 `sha256:246e16b96e30ba09bb328fd5db632134164d01c5c8f61c28d4cc08cd58b67dcf`다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `70208048b7c2`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았고 모두 restart 0이다.
- local/public ready와 공개 메인은 HTTP 200이다. 공개 메인 HTML의 가입 href, legacy 상대 redirect, Auth0 authorize의 `screen_hint=signup`을 확인했고 최근 10분 Web 오류 로그는 0건이다.
- 운영 브라우저에서 `회원가입` 링크의 접근 가능한 이름과 목적지를 확인했다. 기존 Auth0 세션 때문에 새 가입 폼 대신 인증 완료 후 `/tidal-connection`으로 복귀했으며 browser error·warning은 0건이다.

## 미검증·다음 작업

- 실제 신규 Auth0 계정을 생성하는 최종 제출은 수행하지 않았다.
- 로컬 임시 archive `C:\Users\jowoo\AppData\Local\Temp\music-pie-63f25ee.tar` 삭제는 실행 정책에 의해 차단되어 작업 공간 밖 임시 폴더에 남아 있다.
