# Zorin OS 프로덕션 이전·배포 설계

날짜: 2026-09-22

## 목적

`music-pie`의 개발과 자동화 검증은 현재 Windows 작업환경에서 계속 수행하고, 실제 서비스는 Zorin OS 홈서버에 배포한다. 현재 Windows PostgreSQL의 사용자, TIDAL 연결, 가져온 플레이리스트, 트랙, 좋아요, MusicBrainz 보강 데이터를 모두 이전하고 공개 주소 `https://mrms.approid.team`을 Zorin 배포로 전환한다.

배포 성공 조건은 다음과 같다.

- Zorin에서 전용 Web, PostgreSQL, Cloudflare Tunnel 컨테이너가 정상 상태다.
- 현재 Windows DB의 전체 업무 데이터가 Zorin DB에 동일하게 복원된다.
- 암호화된 TIDAL token을 기존 `TOKEN_ENCRYPTION_KEY`로 정상 복호화할 수 있다.
- 로컬 loopback과 공개 주소에서 대표 화면과 인증 경계가 정상 응답한다.
- 실제 로그인 계정으로 검색, MMS, TIDAL 연결 상태와 재생을 확인한다.
- 기존 Zorin 프로젝트의 컨테이너, 네트워크, 볼륨, 포트에 영향을 주지 않는다.
- 장애 시 Windows 원본 서비스로 되돌릴 수 있다.

## 확인된 기준 상태

### Windows 원본

- 애플리케이션 기준 커밋은 `47de7c3`, 인수인계 문서 커밋은 `5a2e0ee`다.
- Next.js production 서버는 `127.0.0.1:44119`에서 실행된다.
- Cloudflare Tunnel `music-pie`가 `mrms.approid.team`을 Windows 원본으로 전달한다.
- PostgreSQL 16.15 컨테이너 `music-pie-postgres`가 `127.0.0.1:55434`에서 실행된다.
- DB 크기는 약 8.4MB다.
- 이전 전 기준 데이터는 `app_users` 1건, `tidal_connections` 1건, `user_playlists` 3건, `music_tracks` 101건, `user_playlist_tracks` 101건, `playlist_imports` 2건, `musicbrainz_artists` 64건, `musicbrainz_enrichment_jobs` 101건, `musicbrainz_rate_limits` 1건, `user_likes` 0건이다.

### Zorin 대상

- SSH 대상은 `approid@192.168.219.174`, 호스트명은 `johae-server`다.
- Zorin OS 18.1, Docker 29.8.1, Docker Compose 5.5.1이 설치되어 있다.
- 서버에는 여러 프로젝트가 Compose로 실행 중이므로 모든 이름과 자원을 `music-pie` prefix로 격리한다.
- `127.0.0.1:3104`는 현재 비어 있으며 music-pie Web 점검 포트로 사용한다.
- `/home/approid/apps/music-pie`는 아직 존재하지 않는다.

## 배포 구조

배포 단위는 `/home/approid/apps/music-pie`의 전용 Docker Compose 프로젝트다.

| 서비스 | 역할 | 네트워크 | 외부 노출 |
|---|---|---|---|
| `postgres` | music-pie 전용 PostgreSQL 16.15 | `backend` | 없음 |
| `web` | Next.js standalone 서버와 API route | `frontend`, `backend`, `egress` | `127.0.0.1:3104` |
| `tunnel` | 기존 `music-pie` Cloudflare Tunnel connector | `frontend` | outbound 연결만 |

전용 자원 이름은 `music-pie-frontend`, `music-pie-backend`, `music-pie-egress`, `music-pie-postgres-data`로 고정한다. `backend`는 `internal: true`로 설정하고 PostgreSQL은 host port를 열지 않는다. Web은 TIDAL, Auth0, MusicBrainz에 연결해야 하므로 별도 `egress` 네트워크에도 연결한다. Tunnel은 Web과만 통신한다.

Web image는 multi-stage Dockerfile로 만든다. build 단계는 lockfile 기준 `npm ci`와 `next build`를 실행하고, runtime 단계에는 Next.js standalone 산출물과 정적 자산만 복사한다. runtime은 root가 아닌 Node 사용자로 실행한다. 이를 위해 `next.config.ts`에 `output: "standalone"`을 추가한다.

## 설정과 비밀값

운영 비밀값은 Git과 image layer에 포함하지 않는다. 서버의 `infra/secrets`는 mode `700`, 각 파일은 mode `600`으로 제한한다.

- `compose.env`: Compose project 이름과 release 식별자
- `database.env`: PostgreSQL DB명, 사용자, 비밀번호
- `web.env`: Auth0, TIDAL, DB 연결, token 암호화, MusicBrainz 설정
- `tunnel.env`: 기존 `music-pie` Tunnel connector token

Windows `.env.local`의 실제 애플리케이션 설정은 값이 로그나 명령 출력에 노출되지 않는 전송 경로로 `web.env`에 옮긴다. `DATABASE_URL`만 Compose 내부 PostgreSQL 주소로 교체한다. 기존 DB의 암호화 token을 유지하려면 `TOKEN_ENCRYPTION_KEY`를 동일하게 이전해야 한다. 공개 origin과 Auth0·TIDAL callback은 기존 `https://mrms.approid.team`을 유지한다.

비밀값 검사 도구는 필수 key 존재, placeholder 부재, 파일 권한만 확인하고 값을 출력하지 않는다. `docker compose config` 검증에는 `--quiet`를 사용한다.

## 데이터 이전

PostgreSQL major version은 원본과 대상 모두 16으로 맞춘다. 이전은 logical backup과 restore로 수행한다.

1. Zorin의 PostgreSQL 컨테이너와 빈 전용 volume을 생성한다.
2. 원본 DB의 schema와 초기 row count를 기록한다.
3. 공개 트래픽 전환 직전에 Windows Web의 쓰기 요청을 중단한다.
4. `pg_dump` custom format으로 최종 backup을 생성하고 checksum을 기록한다.
5. backup을 Zorin의 제한된 임시 경로로 전송한다.
6. Zorin PostgreSQL에 `pg_restore`하고 실패 시 전환을 중단한다.
7. table 목록, schema, 핵심 row count, FK·unique 제약을 원본과 비교한다.
8. 애플리케이션으로 TIDAL 연결 상태와 저장 라이브러리를 읽어 암호화 설정까지 확인한다.
9. 검증 완료 후 임시 backup을 제거하되 Windows 원본 DB volume은 롤백 기간 동안 보존한다.

전환 중에는 원본과 대상 양쪽에서 동시에 쓰기를 허용하지 않는다. 데이터가 맞지 않으면 공개 Tunnel을 전환하지 않고 Windows 원본을 다시 연다.

## Tunnel 전환

`mrms.approid.team`과 Auth0·TIDAL callback URL은 변경하지 않는다. 기존 Cloudflare Tunnel `music-pie`에 Zorin connector를 연결한다.

같은 Tunnel의 Windows connector와 Zorin connector가 서로 다른 DB를 대상으로 동시에 요청을 처리하면 쓰기가 분기될 수 있다. 따라서 다음 순서를 고정한다.

1. Zorin Web을 loopback에서 검증한다.
2. Windows Web의 쓰기를 중단하고 최종 DB backup·restore를 수행한다.
3. Windows Tunnel connector를 중지한다.
4. Zorin Tunnel connector를 시작한다.
5. 공개 주소의 화면, 인증 redirect, 비로그인 API 경계를 확인한다.
6. 실제 로그인 계정의 대표 흐름을 확인한다.

Cloudflare hostname route는 기존 Tunnel을 재사용하므로 DNS와 외부 callback URL을 바꾸지 않는다.

## 배포와 개발 흐름

개발은 Windows worktree에서 수행한다. 각 release는 다음 순서를 따른다.

1. 관련 단위·통합 테스트, ESLint, Next.js production build를 Windows에서 실행한다.
2. 검증한 Git commit SHA를 release 식별자로 사용한다.
3. 추적 파일만 포함한 clean source archive를 Zorin release 경로로 전송한다.
4. Zorin에서 해당 SHA tag의 Web image를 build한다.
5. schema 변경이 있으면 검토한 migration을 애플리케이션 교체 전에 한 번 실행한다.
6. Web 컨테이너를 교체한다.
7. loopback smoke와 공개 smoke를 실행한다.
8. 로그인된 실제 사용자 흐름을 확인하고 release SHA와 결과를 기록한다.

서버 source는 직접 수정하지 않는다. 최초 배포에서는 로컬 검증 commit의 archive를 사용하고, 이후 Git 원격 배포를 도입하려면 별도 권한과 CI 정책을 확정한다.

## Migration 정책

현재 `001`~`006` SQL은 원본 DB에 이미 적용되어 있고 자동 migration metadata는 없다. 최초 이전은 DB 전체 restore이므로 기존 migration을 다시 실행하지 않는다.

최초 배포 후부터는 새 migration마다 다음을 지킨다.

- forward SQL과 필요한 rollback 또는 복구 절차를 함께 작성한다.
- 배포 전에 backup 또는 복원 지점을 확보한다.
- 별도 one-off Compose 명령으로 한 번만 실행한다.
- 성공한 migration 식별자와 checksum을 `schema_migrations`에 기록한다.
- `001`~`006`은 최초 이전 시 baseline으로 기록하되 실제 schema와 일치하는지 먼저 검증한다.
- 애플리케이션 롤백이 가능하도록 우선 expand-and-contract 방식을 사용한다.

실제 임베딩 저장 schema는 추천 기능 설계에서 별도로 확정하며, 이번 배포 기반 설계에서 추정해 만들지 않는다.

## 검증

### 로컬 개발 검증

- `apps/web`: `npm test`
- `apps/web`: `npm run lint`
- `apps/web`: `npm run build`
- Compose model: 실제 값을 출력하지 않는 `docker compose ... config --quiet`
- Web image: clean source에서 production image build

### Zorin 배포 검증

- PostgreSQL health check 성공
- Web health check 성공
- `http://127.0.0.1:3104/`, `/search`, `/mms` HTTP 200
- `https://mrms.approid.team/`, `/search`, `/mms` HTTP 200
- 비로그인 `https://mrms.approid.team/api/likes` HTTP 401
- 원본과 대상의 핵심 table row count 일치
- 실제 로그인 후 TIDAL 연결 상태, 가져온 플레이리스트, 트랙 목록 확인
- 실제 TIDAL 트랙 재생과 Device Code 재연결 경로 확인
- 로그에 token, cookie, 전체 signed stream URL, DB 비밀번호가 없는지 확인

## 오류 처리와 롤백

다음 조건에서는 Zorin으로 공개 전환하지 않는다.

- image build 또는 Compose 검증 실패
- DB restore 실패 또는 row count·schema 불일치
- `TOKEN_ENCRYPTION_KEY` 불일치로 저장 token을 사용할 수 없음
- Zorin loopback smoke 실패

공개 전환 후 장애가 발생하면 Zorin Tunnel을 중지하고 Windows DB가 전환 이후 쓰기를 받지 않았는지 확인한 뒤 Windows Web과 Tunnel을 다시 연다. Zorin에서 이미 쓰기가 발생했다면 데이터를 버리고 단순 복귀하지 않는다. 변경된 row를 조사하고 병합 또는 역이전 방식을 결정한 뒤 복귀한다.

Windows 원본 Web, DB volume, Tunnel 설정은 실제 서버 검증과 안정화가 끝날 때까지 삭제하지 않는다. `docker compose down -v`, volume prune, 광범위한 image prune은 사용하지 않는다.

## 범위 밖

- 실제 임베딩 모델 호출, 벡터 저장 schema, 사용자 취향 벡터와 GMS 점수화
- 무중단 다중 노드 배포
- GitHub Actions 기반 자동 배포
- 자동 backup 보관·복원 스케줄과 외부 모니터링
- Windows 원본 환경의 최종 폐기

이 항목들은 Zorin 최초 이전과 실제 사용자 흐름 검증이 끝난 뒤 별도 설계·작업으로 진행한다.
