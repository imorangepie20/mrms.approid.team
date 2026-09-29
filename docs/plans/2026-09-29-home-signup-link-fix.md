# 메인 회원가입 링크 수정 계획

## 문제

- 메인의 `회원가입` 링크가 `/api/auth/signup`을 가리킨다.
- 운영 reverse proxy 뒤에서 이 route handler가 `request.url`의 내부 원본 주소를 기준으로 절대 redirect를 만들어 `https://0.0.0.0:3000/api/auth/login?screen_hint=signup`으로 보낸다.
- Auth0 SDK의 현재 가입 진입 계약은 `/api/auth/login?screen_hint=signup`이다.

## 변경

1. 익명 사용자용 `회원가입` 링크를 `/api/auth/login?screen_hint=signup`으로 직접 연결한다.
2. 기존 `/api/auth/signup`은 오래된 링크 호환을 위해 host와 무관한 상대 `Location`으로 같은 경로에 redirect한다.
3. 컴포넌트·루트 레이아웃·route handler 테스트로 링크와 redirect 계약을 검증한다.

## 완료 기준

- 메인 `회원가입` 링크가 Auth0 가입 화면용 `screen_hint=signup`을 포함한다.
- 운영 hostname으로 `/api/auth/signup`을 열어도 내부 원본 hostname이 노출되지 않는다.
- 관련 테스트, lint, production build가 통과한다.
