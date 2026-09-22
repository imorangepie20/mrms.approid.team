# EMS 카탈로그 수집 운영 절차

## 사전 조건

- Zorin 접속: `approid@192.168.219.174`.
- 서버 secret 디렉터리: `/home/approid/apps/music-pie/shared/secrets` (디렉터리 `700`, secret 파일 `600`).
- `ems.env`에는 `DATABASE_URL`, `EMS_CURSOR_SECRET`, `TIDAL_REQUEST_BUDGET`을 넣고 TIDAL Client Credentials는 별도 승인 후 추가한다. 값은 명령 출력·로그에 표시하지 않는다.
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
3. ISRC exact → title/artist/album + duration ±2초 순으로 검색한다. 동률, KR `STREAM` 불충족, 30초 미만은 승격하지 않는다.
4. 429의 `Retry-After`, token refresh 1회, daily budget, disk 70%/DB/embedding health gate를 확인한다.
5. matched track·TIDAL source·KR availability를 한 transaction으로 승격하고 embedding job을 enqueue한다.
6. matched/ambiguous/not_found/unavailable/retryable, duplicate, embedding completion을 기록한다.
7. false-match가 1% 미만이고 playback sample 20개 및 rollback rehearsal가 통과할 때만 EMS API를 공개한다.

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
