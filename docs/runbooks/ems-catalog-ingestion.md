# EMS 카탈로그 수집 운영 절차

## 사전 조건

- Zorin 접속: `approid@192.168.219.174`.
- 서버 secret 디렉터리: `/home/approid/apps/music-pie/shared/secrets` (디렉터리 `700`, secret 파일 `600`).
- `ems.env`에는 `DATABASE_URL`, `EMS_CURSOR_SECRET`, TIDAL Client Credentials를 서버 secret으로 둔다. 값은 명령 출력·로그에 표시하지 않는다.
- 기존 수동 CLI의 `TIDAL_REQUEST_BUDGET`은 해당 명령의 요청 상한이다. TIDAL 제공사의 일일 요청 한도를 뜻하지 않는다.
- raw MusicBrainz dump는 Zorin으로 복사하지 않는다. 검증된 `manifest.json`과 `candidates.csv.gz`만 전달한다.

## 1k canary dry-run

```bash
docker run --rm --network music-pie-backend \
  -v /home/approid/apps/music-pie/shared/candidates.csv.gz:/artifacts/candidates.csv.gz:ro \
  -v /home/approid/apps/music-pie/shared/manifest.json:/artifacts/manifest.json:ro \
  music-pie-ems-pipeline:current python -c 'from pathlib import Path; from ems_pipeline.importer import ManifestImporter; m=ManifestImporter.validate(Path("/artifacts/manifest.json"), Path("/artifacts/candidates.csv.gz")); print(m.row_count, m.snapshot_id, m.sha256)'
```

DB migration은 Web image에 포함된 runner를 tools profile로 실행한다. 기존 스키마를 인수할 때는 baseline을 명시한다.

```bash
docker compose -p music-pie -f /home/approid/apps/music-pie/current/infra/compose.zorin.yml \
  --profile tools run --rm migrate node apps/web/scripts/migrate.mjs \
  --baseline-through=008_ems_catalog.sql
```

성공 조건은 checksum·header·row count 검증, `row_count=1000`이다. 실패하면 DB write나 resolver를 시작하지 않는다.

## Live canary gate

1. TIDAL credentials와 승인된 request budget을 secret 파일에 추가한다.
2. run을 `pending`으로 만들고 candidate를 staging한다. `FOR UPDATE SKIP LOCKED` lease와 checkpoint를 사용한다.
3. ISRC exact → title/artist + duration ±2초 순으로 검색한다. 같은 ISRC의 여러 에디션은 KR `STREAM`, 제목·아티스트, 재생시간, 앨범, TIDAL ID 순으로 하나를 선택하며 KR `STREAM` 불충족과 30초 미만은 승격하지 않는다.
4. 429의 `Retry-After`, token refresh 1회, 명령별 요청 상한, disk 70%/DB/embedding health gate를 확인한다.
5. matched track·TIDAL source·KR availability를 한 transaction으로 승격하고 embedding job을 enqueue한다.
6. matched/ambiguous/not_found/unavailable/retryable, duplicate, embedding completion을 기록한다.
7. false-match가 1% 미만이고 playback sample 20개 및 rollback rehearsal가 통과할 때만 EMS API를 공개한다.

## 에디토리얼 섹션 동기화 gate

`009_ems_editorial_sections.sql` 적용과 rollback dump 검증 뒤, 실제 write 전에 반드시 dry-run을 실행한다. Web 컨테이너의 network namespace를 공유해야 Zorin의 DB DNS와 TIDAL egress를 함께 사용할 수 있다.

```bash
docker run --rm --network container:music-pie-web-1 \
  --env-file /home/approid/apps/music-pie/shared/secrets/ems.env \
  music-pie-ems-pipeline:<검증한-release> \
  python -m ems_pipeline.cli sync-editorial-sections --dry-run
```

- JSON의 `joined`를 dry-run projected stored count로 판정한다. dry-run의 `stored`는 write를 하지 않으므로 0이다.
- 최소 4개 섹션이 각각 `joined >= 6`일 때만 같은 명령에서 `--dry-run`을 제거해 실제 동기화한다.
- gate 실패 시 실제 sync, image `current` 전환, release symlink 전환, Web 재시작을 하지 않는다.
- 실제 sync 뒤 section별 membership 수와 `(section_id, track_id)` 중복 0건을 확인한다.
- 이 섹션 동기화 명령은 one-off 작업이며, 아래 관리자 수집 워커와 별개로 실행한다.

## 관리자 EMS 수집

`011_ems_admin_ingestion.sql` 적용 뒤 `ems-pipeline` 서비스를 상시 실행한다. 관리자 허용 목록 `ADMIN_AUTH0_SUBJECTS`가 설정된 계정에서 `/admin/ems/ingestion`을 연다.

1. `수집 시작`은 DB에 작업 하나를 만들고, 워커가 TIDAL 공개 에디토리얼 플레이리스트를 탐색한다. 동시에 열려 있는 작업은 하나만 허용한다.
2. 화면은 5초마다 활성 트랙, 임베딩 완료, 후보·매칭, TIDAL 요청 수, 탐색한 플레이리스트, 단계·오류·마지막 처리 시각, 두 증가 그래프를 갱신한다.
3. `일시정지`는 다음 TIDAL 요청 전에 작업을 멈춘다. `재개`는 저장된 플레이리스트 위치와 후보 상태에서 이어간다. 플레이리스트 조회 중 멈추면 해당 플레이리스트는 다시 읽을 수 있다.
4. 기본 TIDAL 요청 간격은 1.5초이며 `TIDAL_MIN_REQUEST_INTERVAL_SECONDS`로 늘릴 수 있다. 429 응답은 `Retry-After`가 지정한 시간 동안 대기한다. 제공사 일일 요청 예산이나 4,000곡 상한은 적용하지 않는다.
5. 발견된 플레이리스트와 재시도 후보를 모두 처리하고 임베딩이 끝나면 완료한다. 이후 새 소스를 다시 탐색하려면 새 작업을 시작한다.

운영 전에는 migration을 먼저 적용하고, Web과 EMS 워커를 새 이미지로 재생성한다. Web 요청은 TIDAL에 직접 연결하지 않으며, 비밀값은 기존 서버 secret에서만 읽는다.

## Pause·rollback

- health gate 실패 또는 예산 초과: 신규 candidate lease를 만들지 않고 run을 `paused`로 기록한다.
- resolver 오류: 해당 candidate만 `retryable` 또는 quarantine으로 남기고 active track은 삭제하지 않는다.
- canary 실패: run을 `rolled_back`으로 표시하고 API는 계속 빈/기존 active 결과만 노출한다. migration down이나 `docker compose down -v`는 사용하지 않는다.
- 10k gate는 1k 기준선보다 false-match·unavailable 비율이 악화되지 않을 때만 승인한다.

## 점검 명령

```bash
docker compose -p music-pie -f /home/approid/apps/music-pie/current/infra/compose.zorin.yml ps
curl -fsS http://127.0.0.1:3104/api/health/ready
curl -fsS http://127.0.0.1:3104/api/ems/catalog
```

secret 값, OAuth token, cookie, signed stream URL, raw TIDAL query는 출력하거나 저장하지 않는다.
