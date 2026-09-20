# 사용자별 TIDAL 연결 저장소

## 변경 이유

Auth0 계정과 TIDAL 연결 상태·암호화 토큰을 사용자 단위로 분리해 저장할 서버 경계가 필요했다. 실제 TIDAL OAuth endpoint와 scope는 아직 확정 전이므로 토큰 교환은 추가하지 않았다.

## 변경 내용

- 연결 상태를 `not_connected`, `authorization_pending`, `connected`, `reauthentication_required`, `disconnected`로 제한했다.
- `app_users.auth0_subject`를 고유 사용자 키로 두고 `tidal_connections`를 1:1로 연결하는 expand migration을 추가했다.
- 모든 조회·갱신 SQL이 요청한 Auth0 `sub`를 조건으로 사용하도록 repository를 구현했다.
- AES-256-GCM 토큰 암호화 모듈과 repository가 이후 TIDAL callback에서 사용할 인터페이스를 제공한다.
- rollback용 down migration은 별도 파일로 제공하며 자동 실행하지 않는다.

## 검증 결과

- `npm run test -- --run src/lib/auth/token-cipher.test.ts src/lib/db/user-connections.test.ts`: 2개 파일, 5개 테스트 통과.
- `npm run test`: 16개 파일, 32개 테스트 통과.
- `npm run lint`: 오류 없이 통과.
- `npm run build`: Next.js production build 통과.

## 미검증 항목

- `DATABASE_URL`이 설정되지 않아 실제 PostgreSQL에 migration을 적용하지 않았다.
- 실제 TIDAL access token·refresh token 저장과 복호화는 OAuth 계약 확인 전까지 수행하지 않았다.

## 롤백

`001_user_tidal_connections.down.sql`은 `tidal_connections`를 먼저 제거한 뒤 `app_users`를 제거한다. 데이터가 삭제되는 작업이므로 명시적인 승인과 백업 확인 전에는 실행하지 않는다.

## 다음 작업

TIDAL authorization endpoint, token endpoint, scope, refresh 정책을 원본 문서에서 확인한 뒤 Authorization Code + PKCE callback을 연결한다.
