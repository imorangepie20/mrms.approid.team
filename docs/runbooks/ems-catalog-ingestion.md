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
5. 발견된 플레이리스트와 재시도 후보를 모두 처리하고 임베딩이 끝나면 완료한다. 정기 수집이 켜져 있으면 하루 뒤 재탐색을 예약하며, 관리자는 별도 수동 작업도 시작할 수 있다.

## 정기 원천 갱신

`012_ems_source_routines.sql` 적용 후 `ems-pipeline`과 `ems-source-routines`를 실행한다. 관리자 메뉴 `/admin/ems/routines`에서 세 원천의 상태를 확인한다.

- TIDAL 에디토리얼: 이전 작업 완료 뒤 하루 후 새 작업을 예약한다. `lastUpdatedAt`이 그대로인 플레이리스트는 생략한다. 갱신 시각이 없으면 다시 읽는다. 수동으로 일시정지한 작업은 자동 재개하지 않는다.
- MusicBrainz core: `LATEST`를 12시간마다 확인하고 새 버전일 때만 서명·SHA-256을 검증해 다운로드한다. 새 녹음·새 ISRC의 후보를 만든다.
- MusicBrainz canonical: 배포 목록을 24시간마다 확인하고 새 버전일 때만 SHA-256을 검증해 다운로드한다. core 후보의 대표 발매와 순위에 사용한다. canonical만 바뀌어도 독립적인 곡은 생기지 않는다.
- 원본은 저장소 밖 `/home/approid/apps/music-pie/shared/musicbrainz`에 둔다. 검증된 최신 두 버전만 보관한다. 디스크 사용률이 70% 이상이면 새 다운로드를 시작하지 않고 오류와 다음 재시도 시각을 기록한다.
- MusicBrainz 후보는 기존 TIDAL resolver와 임베딩 경로를 통과한다. 현재 수동 TIDAL 작업이 실행 중이면 후보는 DB에 대기한다. 429 `Retry-After`와 최소 요청 간격을 따른다.
- `정기 수집 중지`는 이후 확인과 해당 MusicBrainz 후보의 다음 요청을 막는다. `정기 수집 켜기` 또는 `지금 확인`으로 이어간다.

새 버전이 없으면 `last_checked_at`과 `next_check_at`만 갱신하고 후보나 새 작업을 만들지 않는다. 비밀값과 원본 dump를 저장소에 복사하지 않는다.

## EMS 메타데이터·통계

`014_ems_track_metadata.sql` 적용 뒤 `/admin/ems/statistics`에서 활성 트랙의 태그, 발매 시기, 유입 시기와 누락 수를 확인한다. `first_seen_at`은 EMS 유입일이며 발매일이 아니다. 발매 시기는 MusicBrainz 최초 발매일이 있으면 우선하고, 그렇지 않으면 TIDAL 앨범 발매일을 사용한다. 원천 날짜가 없거나 유효하지 않으면 미상으로 둔다.

- 신규 매칭은 TIDAL track·album 속성과 아티스트 ID를 `ems_track_sources.metadata`에 보존한다. 앨범 `releaseDate`가 정상 날짜이면 `tidal_album_release_date`에 저장한다.
- 기존 곡은 `python -m ems_pipeline.cli backfill-tidal-metadata --interval-seconds 3`으로 20곡씩 조회한다. 429는 `Retry-After`에 따라 쉰다. Web 요청에서는 TIDAL을 조회하지 않는다.
- MusicBrainz 태그는 CC0 core가 아닌 `mbdump-derived.tar.bz2`에 있다. 공식 서명으로 검증한 `SHA256SUMS`의 derived 항목과 다운로드 파일의 SHA-256을 대조한다. `backfill-musicbrainz-tags --core <선택한 core/mbdump> --derived-archive <검증한 파일> --snapshot-id <버전>`은 ISRC·제목·길이로 녹음을 대조한 뒤 녹음 ID·원문 태그·투표 수·snapshot 버전을 저장한다. 중복 에디션 때문에 태그 대조용 녹음 ID는 기존 유일키의 `recording_mbid`와 별도 필드다.
- core 전체 아카이브와 derived 원본은 저장소 밖에 보존한다. derived 태그의 라이선스는 CC BY-NC-SA 3.0이다. 상업적 사용 권한은 별도 확인이 필요하다.

`016_ems_musicbrainz_metadata_routine.sql` 적용 후 `ems-source-routines`가 6시간마다 신규 활성곡과 새 core 버전을 확인한다. 같은 버전의 곡은 `mb_metadata_snapshot_id`로 중복 대조하지 않는다. derived 아카이브는 해당 core 버전의 서명된 체크섬으로 검증한다. 녹음 최초 발매일은 core dump에 없으므로 [MusicBrainz 녹음 검색 API](https://musicbrainz.org/doc/MusicBrainz_API/Search)의 `first-release-date`를 MBID 묶음으로 조회한다. [요청 제한](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)에 맞춰 요청 간격을 2초 이상 두고 429·503은 재시도한다. 연·월·일이 모두 있는 날짜만 `mb_first_release_date`에 저장한다. 관리자 `정기 수집`의 `MusicBrainz 메타데이터` 카드에서 버전·처리 수·오류를 확인하고 `지금 확인`을 요청할 수 있다.

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
