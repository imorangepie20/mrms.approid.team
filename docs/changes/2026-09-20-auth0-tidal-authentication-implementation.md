# Auth0·TIDAL 인증 연동 구현

## 변경 이유

Auth0 연동 중 `/api/auth/login`이 404를 반환해 로그인을 시작할 수 없었다. 또한 로그인 이후 TIDAL 연결 상태를 사용자별로 보관하고, 연결이 완료된 사용자에게만 GMS·MMS 개인화 기능을 제공할 경계가 필요했다.

## 변경 내용

- Next.js 16 `proxy.ts`에서 Auth0 SDK 미들웨어를 실행하고 기존 `/api/auth/*` 경로 계약을 유지했다.
- 서버 세션 기반 로그인·로그아웃·계정 UI와 Auth0 `sub` 조회 경계를 추가했다.
- PostgreSQL 사용자별 TIDAL 연결 저장소와 AES-256-GCM 토큰 암호화를 추가했다.
- TIDAL Authorization Code + PKCE 연결, callback, status 경로를 추가했다.
- TIDAL 공식 OAuth 주소와 `playlists.read` 범위를 사용했다.
- 로그인 및 TIDAL 연결 상태가 모두 충족될 때만 GMS·MMS 개인화 기능을 열고, 그 외 상태에는 로그인·연결·재연결 안내를 표시한다. EMS는 공개 상태를 유지한다.
- `.env.example`에서 실제 비밀값을 제거하고 필요한 환경 변수 이름만 남겼다.

## 검증 결과

- `npm run test`: 19개 테스트 파일, 41개 테스트 통과
- `npm run lint`: 통과
- `npm run build`: 통과, Next.js Proxy와 인증·TIDAL API 경로 생성 확인
- 로컬 HTTP 확인: `/` 200, `/api/auth/login` 307(Auth0 authorize 경로), 익명 `/account` 307(로그인 경로)
- 공개 HTTPS 확인: `https://mrms.approid.team` 200

## 미검증 항목

- 실제 Auth0 계정으로 로그인한 뒤 공개 callback을 거쳐 세션이 생성되는 전체 흐름
- 실제 TIDAL 동의 화면, callback, 토큰 암호화 저장 및 사용자별 `connected` 상태
- PostgreSQL migration 적용. 현재 `DATABASE_URL`이 없어 migration 파일만 준비했다.
- TIDAL 토큰 만료·갱신·권한 철회에 따른 재인증 전환

## 보안 및 운영 후속 작업

- 작업 중 노출된 적이 있는 Auth0 client secret과 `AUTH0_SECRET`은 폐기하고 새 값으로 교체한다.
- `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `TIDAL_CLIENT_ID`를 비밀 저장소에 설정한 뒤 migration을 적용한다.
- TIDAL Developer Terms의 AI 서비스 제한과 사용자 연결 해제 시 데이터 삭제 의무를 확인하기 전에는 TIDAL 콘텐츠를 AI 분석 입력으로 전달하지 않는다.

## 다음 작업

1. Auth0 비밀값을 교체하고 Dashboard callback·logout·origin 설정을 재확인한다.
2. PostgreSQL과 TIDAL 애플리케이션 값을 설정하고 migration을 적용한다.
3. 공개 도메인에서 Auth0 로그인과 TIDAL 연결을 실제 계정으로 수동 검증한다.
4. 연결 해제·데이터 삭제와 토큰 갱신 정책을 구현하고 회귀 테스트를 추가한다.
