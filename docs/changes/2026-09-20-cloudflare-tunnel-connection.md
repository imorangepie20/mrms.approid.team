# Cloudflare Tunnel 연결

## 변경 이유

TIDAL 연동에 앞서 사용자 웹앱을 `mrms.approid.team`의 HTTPS 공개 주소로 제공해야 했다.

## 변경 내용

- Cloudflare에 `music-pie` 전용 tunnel을 생성했다.
- `mrms.approid.team` CNAME을 해당 tunnel로 연결했다.
- 로컬 원본을 `127.0.0.1:44119`으로 제한하고, 그 외 ingress 요청은 `404`로 차단했다.
- 실행·점검 절차와 Auth0·TIDAL 후속 설정 경계를 문서화했다.

## 검증 결과

- `cloudflared tunnel ingress validate`: 성공
- `cloudflared tunnel info music-pie`: connector가 Cloudflare edge 3곳에 연결됨
- `curl.exe -I http://127.0.0.1:44119`: `200 OK`
- Cloudflare edge IP를 이용한 `https://mrms.approid.team` 요청: `200 OK`

## 미검증 항목

- 각 사용자 네트워크의 DNS 캐시 전파 시간
- Auth0 callback과 실제 TIDAL OAuth callback
- 서버 재부팅 뒤 웹앱과 `cloudflared`의 서비스 자동 시작

## 다음 작업

Auth0 Universal Login과 PostgreSQL 사용자 저장소를 구현한 뒤, TIDAL OAuth 권한·endpoint를 확인해 별도 연결 흐름을 구현한다.
