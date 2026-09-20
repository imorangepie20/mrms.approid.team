# Auth0 기반 가입·로그인 및 TIDAL 연결 설계

## 목적

`music-pie` 사용자가 이메일·비밀번호 또는 Auth0 소셜 로그인으로 계정을 만들고 로그인할 수 있게 한다. 사용자 계정 인증과 TIDAL 음악 데이터 접근 권한은 분리한다. 가입 직후와 로그인 뒤에 TIDAL 연결 상태를 확인해, 연결된 사용자만 플레이리스트 동기화와 개인화 추천을 사용할 수 있게 한다.

## 범위

- Auth0 Universal Login을 사용자 계정 인증 화면으로 사용한다.
- Auth0 Database Connection(이메일·비밀번호)과 활성화된 소셜 Connection을 함께 제공한다.
- TIDAL 연결은 별도의 OAuth Authorization Code + PKCE 흐름으로 처리한다.
- TIDAL 연결 상태, 만료 여부, 재연결 필요 상태를 사용자 단위로 관리한다.
- PostgreSQL에 내부 사용자, TIDAL 연결 상태, 토큰 암호화 저장 메타데이터를 보관한다.
- 공개 사용자 웹앱의 기준 URL은 `https://mrms.approid.team`으로 한다.
- Cloudflare Tunnel로 `mrms.approid.team` HTTPS 요청을 사설 원본 서비스에 전달한다.
- TIDAL 권한이 없거나 만료된 사용자는 공개 EMS 탐색은 할 수 있지만 MMS 초기화·GMS 개인화 추천은 사용할 수 없다.

## 범위 밖

- 실제 Auth0 테넌트 생성, 도메인·클라이언트 ID·비밀값 입력
- 실제 TIDAL OAuth endpoint, scope, refresh token 보관 방식의 확정
- 실제 플레이리스트 수집·추천 모델·데이터베이스 마이그레이션
- 관리자 화면 인증

## 사용자 흐름

### 회원가입

1. 사용자는 Auth0 Universal Login에서 이메일·비밀번호 가입 또는 소셜 로그인을 선택한다.
2. Auth0가 애플리케이션의 인증 콜백으로 사용자를 반환한다.
3. 애플리케이션은 내부 사용자 식별자와 Auth0 `sub`를 연결한다.
4. 가입 완료 화면에서 TIDAL 연결을 안내한다.
5. 사용자가 동의하면 TIDAL Authorization Code + PKCE 흐름을 시작한다.
6. 콜백에서 `state`와 PKCE verifier를 검증한 뒤 authorization code를 서버에서 교환한다.
7. TIDAL 연결 상태가 활성화되면 가져올 플레이리스트를 선택해 MMS 초기화를 시작한다.

### 로그인

1. 사용자는 Auth0 Universal Login으로 인증한다.
2. 애플리케이션은 Auth0 세션을 검증하고 내부 사용자와 연결한다.
3. 해당 사용자의 TIDAL 연결 상태를 확인한다.
4. 활성 상태면 마지막 동기화 정책에 따라 플레이리스트 동기화를 허용하고 GMS·MMS를 연다.
5. 미연결·만료·철회 상태면 TIDAL 재연결 안내를 표시한다. 공개 EMS 탐색은 유지한다.

## 시스템 경계

| 영역 | 책임 | 보관하면 안 되는 것 |
| --- | --- | --- |
| 브라우저/Next.js UI | 로그인 시작, 연결 상태 표시, 콜백 결과에 따른 화면 전환 | TIDAL client secret, 장기 refresh token, PKCE verifier의 영구 저장 |
| Auth0 | 사용자 인증, 세션·ID token 발급, 이메일·소셜 Connection 처리 | TIDAL 개인화 데이터의 기준 저장소 역할 |
| 애플리케이션 서버 | Auth0 세션 검증, TIDAL code 교환, `state`/PKCE 검증, 연결 상태 갱신 | 다른 사용자의 TIDAL 토큰·개인 모델 혼용 |
| TIDAL | 사용자가 동의한 권한 내 플레이리스트·트랙 자원 제공 | 음악 데이터 외 사용자 계정 인증의 기준 역할 |
| PostgreSQL | 내부 사용자와 Auth0 `sub` 매핑, TIDAL 연결 상태·암호화된 토큰 저장 | 브라우저에서 직접 접근, 사용자 간 연결 데이터 공유 |
| Cloudflare Tunnel | `mrms.approid.team` 공개 hostname을 사설 웹 원본으로 라우팅 | TIDAL·Auth0 비밀값 저장, 사용자 인증의 기준 역할 |

## 상태 모델

`tidalConnectionStatus`는 사용자 단위다.

| 상태 | 의미 | UI/권한 |
| --- | --- | --- |
| `not_connected` | 연결 이력 없음 | 연결 안내, EMS만 공개 |
| `authorization_pending` | TIDAL 동의 화면 또는 콜백 처리 중 | 진행 상태 표시, 중복 연결 차단 |
| `connected` | 토큰이 유효하고 필요한 권한이 확인됨 | 플레이리스트 선택·MMS·GMS 사용 가능 |
| `reauthentication_required` | 만료, 권한 부족, 사용자 철회, 갱신 실패 | 재연결 안내, MMS/GMS 제한 |
| `disconnected` | 사용자가 연결 해제함 | 수집 중지, EMS만 공개 |

연결 해제는 이미 MMS에 반영된 취향 데이터와 영구 제외 상태를 자동 삭제하지 않는다. 실제 보존·삭제 정책은 별도 결정 후 구현한다.

## 보안 기준

- Auth0와 TIDAL의 callback URL은 등록된 HTTPS URL만 허용한다.
- OAuth 요청마다 예측 불가능한 `state`를 생성하고 콜백에서 검증한다.
- TIDAL OAuth에는 Authorization Code + PKCE를 사용한다.
- access token·refresh token·client secret은 브라우저, 소스 저장소, 로그에 노출하지 않는다.
- Auth0 `sub`, 내부 사용자 ID, TIDAL 연결·플레이리스트 데이터는 사용자 단위로만 결합한다.
- TIDAL 응답의 실제 scope·만료·갱신 규칙이 확인되기 전에는 자동 동기화 또는 토큰 갱신을 구현하지 않는다.

## 구성값 계약

다음 값은 배포 환경의 비밀/설정으로 제공하며 저장소에 기록하지 않는다.

- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET` (서버 전용인 애플리케이션 유형일 때만)
- `AUTH0_SECRET`
- `AUTH0_BASE_URL`
- `TIDAL_CLIENT_ID`
- `TIDAL_CLIENT_SECRET` (TIDAL 정책이 요구하는 경우 서버 전용)
- `TIDAL_AUTHORIZE_URL`
- `TIDAL_TOKEN_URL`
- `TIDAL_REDIRECT_URI`
- `TIDAL_SCOPES`
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CLOUDFLARE_TUNNEL_TOKEN` (원격 관리 터널을 사용할 때 서버 전용)

## 공개 URL과 터널 계약

- 프로덕션 공개 URL은 `https://mrms.approid.team`이다.
- Auth0 Allowed Callback URL은 `https://mrms.approid.team/api/auth/callback`로 등록한다.
- Auth0 Allowed Logout URL은 `https://mrms.approid.team`로 등록한다.
- TIDAL callback URL은 `https://mrms.approid.team/api/tidal/callback`로 등록한다.
- Cloudflare Dashboard에서 `mrms.approid.team` published application route를 터널에 연결하고, 서비스 URL은 `cloudflared`가 실행되는 호스트의 웹 원본 주소로 설정한다.
- 서비스 URL은 배포 프로세스에서 정한 루프백 주소와 전용 포트를 사용한다. 개발 서버 포트와 공개 URL을 혼용하지 않는다.
- 로컬 관리 터널을 쓸 경우 ingress의 마지막 규칙은 `http_status:404` catch-all로 끝낸다. 원격 관리 터널을 쓸 경우 동일한 hostname-to-service 규칙을 Cloudflare Dashboard에 설정한다.
- Cloudflare Tunnel 토큰과 credential 파일은 저장소·클라이언트·로그에 넣지 않는다.

## 완료 기준

- Auth0 이메일·비밀번호와 선택한 소셜 Connection으로 가입·로그인이 가능하다.
- 가입 완료와 로그인 후에 TIDAL 연결 상태가 사용자별로 정확하게 표시된다.
- TIDAL 연결 콜백은 `state`와 PKCE 검증 실패 시 연결 상태를 바꾸지 않는다.
- 유효한 연결이 있어야 MMS 초기화와 GMS 개인화 추천에 접근할 수 있다.
- 재연결·해제는 다른 사용자의 연결·MMS·영구 제외 상태에 영향을 주지 않는다.
- 실제 TIDAL 권한 범위, callback, 토큰 수명, 보존·삭제 정책이 검증되어 있다.

## 미결정 항목

1. Auth0 테넌트 도메인, 애플리케이션 유형, 활성 소셜 Connection 목록
2. TIDAL의 실제 authorization/token endpoint, scope, refresh token 제공·회전 규칙
3. PostgreSQL의 실제 접속 주소, 마이그레이션 도구, 토큰 암호화 키 관리 방식과 보존·삭제 정책
4. Cloudflare Tunnel 관리 방식(원격 관리 토큰 또는 로컬 credential), 사설 원본 서비스 주소와 전용 포트
5. 로그인 직후 동기화 주기와 실패 재시도 정책
6. 연결 해제 시 MMS·개인화 벡터·영구 제외 데이터의 처리 정책
