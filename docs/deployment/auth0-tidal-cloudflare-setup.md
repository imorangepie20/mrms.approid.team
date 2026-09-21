# Auth0·TIDAL·Cloudflare Tunnel 운영 설정

## 현재 연결 상태

- 공개 도메인: `https://mrms.approid.team`
- Cloudflare Tunnel: `music-pie` (`f1f0eae1-012c-463c-9cea-b623893455c2`)
- 사설 원본: `http://127.0.0.1:44119`
- 터널 설정 파일: `C:\Users\jowoo\.cloudflared\config.yml`

터널 credential JSON과 `cert.pem`은 사용자 프로필에만 보관한다. 이 파일들과 Auth0·TIDAL·PostgreSQL 비밀값은 저장소, 클라이언트 번들, 로그에 넣지 않는다.

## Cloudflare Tunnel 실행

원본 웹앱은 일반적인 포트가 아닌 전용 포트 `44119`에서 실행한다.

```powershell
Set-Location C:\Wspace\music-pie\.worktrees\bright-cinematic-ui\apps\web
npm run build
npm run start -- -p 44119
```

다른 PowerShell에서 다음을 실행한다.

```powershell
cloudflared tunnel run music-pie
```

`C:\Users\jowoo\.cloudflared\config.yml`의 마지막 ingress 규칙은 반드시 `http_status:404`여야 한다. hostname 규칙은 `mrms.approid.team`만 `127.0.0.1:44119`으로 전달한다.

## 점검

```powershell
cloudflared tunnel info music-pie
curl.exe -I http://127.0.0.1:44119
curl.exe -I https://mrms.approid.team
```

성공 기준은 tunnel connector가 연결되고 두 HTTP 요청 모두 `200 OK`를 반환하는 것이다. 로컬 DNS가 전파 전이면 Cloudflare public resolver를 사용해 CNAME을 확인한다.

```powershell
nslookup mrms.approid.team 1.1.1.1
```

## Auth0와 TIDAL 후속 설정

Auth0 Regular Web Application의 callback URL은 `https://mrms.approid.team/api/auth/callback`, logout URL과 web origin은 `https://mrms.approid.team`으로 등록한다. 서버의 `.env.local`에는 다음 v4 SDK 값을 설정한다.

```dotenv
AUTH0_SECRET=
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
APP_BASE_URL=https://mrms.approid.team
```

TIDAL 공식 Authorization 문서와 Web API OAS에서 다음 계약을 확인했다.

```dotenv
TIDAL_CLIENT_ID=
TIDAL_AUTHORIZE_URL=https://login.tidal.com/authorize
TIDAL_TOKEN_URL=https://auth.tidal.com/v1/oauth2/token
TIDAL_REDIRECT_URI=https://mrms.approid.team/api/tidal/callback
TIDAL_SCOPES=playlists.read
TOKEN_ENCRYPTION_KEY=
```

전체 재생을 사용하려면 Limited Input Device client를 별도로 설정한다.

```dotenv
TIDAL_DEVICE_CLIENT_ID=
TIDAL_DEVICE_CLIENT_SECRET=
TIDAL_DEVICE_SCOPES=r_usr w_usr w_sub
TIDAL_DEVICE_AUTHORIZATION_URL=https://auth.tidal.com/v1/oauth2/device_authorization
TIDAL_PLAYBACK_API_BASE_URL=https://api.tidal.com/v1
TIDAL_COUNTRY_CODE=KR
```

- Authorization Code flow에는 S256 PKCE가 필수다.
- `playlists.read`는 사용자가 만든 플레이리스트 목록을 읽는 third-party scope다.
- token 응답은 `access_token`, `expires_in`, 선택적 `refresh_token`, `scope`를 제공한다.
- access token 만료가 60초 이내면 서버가 refresh token으로 자동 갱신한다. Device scope로 저장된 연결은 Device client를 사용한다.
- 사용자가 TIDAL 연결을 해제하면 token과 연결 식별값을 제거하되 이미 가져온 MMS 라이브러리는 유지한다.

비밀값은 `.env.local` 또는 운영 비밀 관리 시스템에만 저장하고 저장소·응답·로그에 기록하지 않는다.

인증, token 저장, stream 해석, 플레이어와 오류 복구의 상세 계약은 `docs/deployment/tidal-full-playback-implementation.md`를 따른다.
