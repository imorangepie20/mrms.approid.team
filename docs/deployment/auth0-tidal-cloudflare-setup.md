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

Auth0 Regular Web Application의 callback URL은 `https://mrms.approid.team/api/auth/callback`, logout URL과 web origin은 `https://mrms.approid.team`으로 등록한다.

TIDAL callback URL, endpoint, scope, token refresh 정책은 TIDAL 개발자 문서와 실제 권한을 확인한 후 별도 연동 작업에서 등록한다. 추정한 endpoint나 비밀값을 이 저장소의 환경 파일에 넣지 않는다.
