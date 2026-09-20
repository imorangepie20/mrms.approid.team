# Auth0 로그인 경로 404 복구

## 변경 이유

`@auth0/nextjs-auth0` v4는 App Router route handler를 자동 생성하지 않고 Next.js 네트워크 경계에서 인증 경로를 처리한다. 해당 proxy가 없는 상태에서 `/api/auth/login`으로 진입해 404가 발생했다. 로컬 `APP_BASE_URL`에도 쉼표로 두 주소가 결합돼 로그인 URL 생성이 실패할 수 있었다.

## 변경 내용

- Next.js 16 `src/proxy.ts`에서 Auth0 middleware를 실행해 `/api/auth/*` 경로를 처리한다.
- Auth0 client의 로그인·로그아웃·콜백·프로필 경로를 기존 공개 계약인 `/api/auth/*`로 유지한다.
- `APP_BASE_URL`은 단일 절대 URL만 허용하도록 구성 검사를 보강했다.
- `.env.example`에는 비밀값을 두지 않고 빈 placeholder만 유지한다.
- 루트 레이아웃에서 Auth0 서버 세션을 읽어 익명 사용자에게 로그인·회원가입을, 인증 사용자에게 계정·로그아웃을 표시한다.
- `/account`는 인증된 사용자의 이름·이메일과 TIDAL 연결 상태만 표시하고, 익명 요청은 로그인 경로로 돌려보낸다.
- 서버 권한 경계 `requireAuth0Subject()`가 인증된 Auth0 `sub`만 반환하도록 추가했다.

## 검증 결과

- `npm run test -- --run src/lib/auth/auth0-config.test.ts`: 2개 테스트 통과.
- 수정된 `.env.local`로 `GET /api/auth/login`: Auth0 `/authorize`로 `307` 응답 확인.
- `npm run test`: 13개 테스트 파일, 26개 테스트 통과.
- 세션·계정 UI 완료 후 `npm run test`: 15개 테스트 파일, 29개 테스트 통과.
- `npm run lint`: 오류 없이 통과.
- `npm run build`: Next.js production build 통과, `Proxy (Middleware)` 등록 확인.
- 실제 production server에서 `/`는 `200`, `/api/auth/login`은 Auth0 `/authorize`로 `307`, 익명 `/account`는 내부 로그인 경로로 `307` 응답 확인.
- Impeccable UI detector: 지적 사항 없음.

## 미검증 항목

- 브라우저에서 Auth0 Universal Login 완료 후 공개 callback으로 돌아오는 실제 세션 생성.
- 회전된 Auth0 client secret 적용 여부.

## 다음 작업

- 노출된 Auth0 client secret을 테넌트에서 회전한 뒤 `.env.local`만 갱신한다.
- PostgreSQL 사용자 연결 저장소를 완료한 뒤 `/account`의 TIDAL 상태를 실제 사용자 레코드와 연결한다.
