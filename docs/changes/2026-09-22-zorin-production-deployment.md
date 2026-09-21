# Zorin OS 프로덕션 이전

날짜: 2026-09-22

## 변경 이유

Windows에서 실행하던 `music-pie` production Web, PostgreSQL, Cloudflare Tunnel을 Zorin OS 홈서버로 이전했다. 개발과 자동화 검증은 Windows에서 계속하고 실제 서비스 검증은 Zorin 배포에서 수행한다.

## 변경 내용

- 배포 release: `216204b7b8d6`
- 서버 경로: `/home/approid/apps/music-pie`
- Compose project: `music-pie`
- Web: `127.0.0.1:3104`, 외부 공개 없음
- PostgreSQL: 전용 `music-pie-postgres-data` volume, host port 없음
- Tunnel: 기존 `music-pie` tunnel을 재사용하고 origin을 Compose 내부 `http://web:3000`으로 지정
- 비밀값: `/home/approid/apps/music-pie/shared/secrets`, directory `700`, files `600`
- Windows Web과 Windows tunnel connector는 중지했다. Windows PostgreSQL 원본 volume은 rollback용으로 유지했다.

## 데이터 이전

- final dump SHA-256: `dcdf48a7bdcb0eaf9f22b2913a95fd8323b589a4bca6203ca4a065e6753d7672`
- 원본과 대상 count 일치:
  - `app_users`: 1
  - `tidal_connections`: 1
  - `user_playlists`: 3
  - `music_tracks`: 101
  - `user_playlist_tracks`: 101
  - `playlist_imports`: 2
  - `musicbrainz_enrichment_jobs`: 101
  - `musicbrainz_rate_limits`: 1
  - `user_likes`: 0
  - `musicbrainz_artists`: 64

## 검증 결과

- `apps/web`: 61개 파일, 242개 테스트 통과
- Next.js production build 통과
- Docker image build 통과, runtime user `node`, `pg` import 확인
- Zorin `music-pie-postgres-1`, `music-pie-web-1` health 통과
- 공개 `/`, `/search`, `/mms`, `/api/health/live`, `/api/health/ready`: HTTP 200
- 공개 비로그인 `/api/likes`: HTTP 401
- 공개 GET `/api/auth/login`: Auth0 `/authorize`로 HTTP 307
- Windows `44119` listener와 Windows `music-pie` tunnel connector가 중지된 상태에서 공개 HTTP 검증 통과
- 기존 Zorin Compose 프로젝트 container가 배포 후에도 실행 상태 유지
- 최근 music-pie Web·Tunnel 로그에서 `ERR`, `Error:`, `Unhandled`, `FATAL` 없음

## 미검증

- 로그인된 Chrome 탭의 UI 자동 확인은 Computer Use 연결 timeout으로 수행하지 못했다.
- 실제 계정의 MMS 데이터 표시, TIDAL 재생, seek, 다음 곡, Device Code 재승인은 사용자 브라우저에서 확인해야 한다.

## 다음 작업

실제 브라우저 검증 후 임베딩 모델 runtime, vector 저장·갱신, 사용자 취향 vector와 GMS 점수화를 별도 설계한다.
