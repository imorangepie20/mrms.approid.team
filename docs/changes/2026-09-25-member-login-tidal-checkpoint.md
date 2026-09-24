# 회원 로그인 뒤 TIDAL 연결 확인

## 이유

기존 Auth0 로그인 콜백은 로그인 전 요청 경로로 즉시 돌아갔다. 회원은 TIDAL 연결 상태를 확인하는 화면을 거치지 않을 수 있었다.

## 변경

- 일반 회원 경로의 Auth0 로그인 성공 시 `/tidal-connection`을 연다. 확인 화면의 계속 링크는 로그인 전 요청한 회원 화면으로 이동한다.
- 연결된 계정에는 `TIDAL 연결됨`과 계속 링크를 표시한다. 미연결·재연결 필요 계정에는 TIDAL 연결 버튼을 표시한다. 기존 공개 탐색 정책에 따라 나중에 연결하고 계속할 수 있다.
- 관리자 경로에서 시작한 로그인은 기존 `/admin/*` 경로로 복귀한다. Auth0 인증 오류·TIDAL 콜백 흐름은 유지한다.
- 연결 상태는 로그인한 사용자 자신의 DB 기록으로 조회하고, 계속 경로는 같은 사이트의 안전한 경로로 제한한다.

## 검증

- Web production build 통과. 로컬 빌드의 Auth0 환경 변수 경고는 기존과 같다.
- 변경 파일 ESLint 오류 0건, `git diff --check` 통과.
- 자동 테스트는 요청되지 않아 추가하거나 실행하지 않았다.

## 운영 적용·미검증

- `24bf96f`를 Zorin Web 이미지로 빌드하고 Web 컨테이너만 교체했다. 이전 이미지는 `music-pie-web:pre-member-login-20260925`로 보존했다. Web은 healthy, 공개 readiness는 HTTP 200이다.
- 비로그인 `/tidal-connection?returnTo=%2Fmms`는 Auth0 로그인으로 HTTP 307 이동한다. `/admin`의 비로그인 로그인 이동과 관리자 API HTTP 401도 유지된다.
- 로그인된 계정에서 Auth0 `/api/auth/login?returnTo=%2Fsearch`를 열어 실제 콜백 후 `/tidal-connection?returnTo=%2Fsearch`에 도착하고 `TIDAL 연결됨`·`음악 화면으로 계속` 링크가 표시됨을 확인했다. 관리자 `/api/auth/login?returnTo=%2Fadmin`은 `/admin`으로 복귀했다.
- 미연결 계정과 재연결 필요 계정의 실제 브라우저 화면은 별도 계정이 없어 직접 확인하지 못했다.
