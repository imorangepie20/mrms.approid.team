# TIDAL PKCE 연결 흐름

## 변경 이유

Auth0 계정 인증과 분리된 TIDAL 사용자 권한 동의 흐름이 필요했다. 공식 TIDAL 문서에서 OAuth 2.1 Authorization Code + PKCE 계약과 `playlists.read` scope를 확인한 뒤 구현했다.

## 변경 내용

- S256 code challenge, 43자 state·verifier, 공식 authorize/token endpoint를 사용하는 OAuth helper를 추가했다.
- connect route는 Auth0 세션을 요구하고 state·verifier를 HttpOnly, Secure, SameSite=Lax 임시 쿠키에 저장한다.
- callback은 state를 검증한 뒤 서버에서 code를 교환하고 access/refresh token을 AES-256-GCM으로 암호화해 현재 Auth0 `sub`에만 저장한다.
- callback 응답과 오류에는 token을 포함하지 않으며 임시 쿠키를 삭제한다.
- status API는 연결 상태만 반환하고 token 값은 반환하지 않는다.
- 온보딩의 실제 연결 행동을 `/api/tidal/connect`로 전환했다.

## 검증 결과

- `npm run test -- --run src/lib/tidal/oauth.test.ts src/app/api/tidal/callback/route.test.ts src/components/onboarding/tidal-onboarding.test.tsx`: 3개 파일, 7개 테스트 통과.
- `npm run test`: 18개 파일, 35개 테스트 통과.
- `npm run lint`: 오류·경고 없이 통과.
- `npm run build`: TIDAL connect/callback/status route를 포함한 production build 통과.
- 익명 `/api/tidal/connect`: Auth0 로그인으로 `307`; 익명 `/api/tidal/status`: `401` 확인.

## 미검증 항목

- TIDAL client ID와 PostgreSQL이 아직 설정되지 않아 실제 사용자 동의·callback·token 저장은 실행하지 않았다.
- refresh token 자동 갱신과 연결 해제 시 token·개인 데이터 삭제는 아직 구현하지 않았다.

## 다음 작업

개인화 접근 정책을 연결하고, 실제 자격 증명·DB가 준비된 환경에서 callback과 사용자별 token 격리를 수동 검증한다.
