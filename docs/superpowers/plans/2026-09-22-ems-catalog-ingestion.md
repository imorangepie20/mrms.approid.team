# EMS 공용 카탈로그 수집·축적 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans when implementing this plan task-by-task.

**목표:** MusicBrainz 공식 direct dump에서 후보를 만들고 TIDAL Catalog를 순차 조회하여, 정확히 매칭되고 KR `STREAM` 가능한 트랙만 EMS에 누적한다. 1,000곡 canary와 10,000곡 gate를 통과한 뒤 100,000곡까지 확장하고 이후 동일 파이프라인으로 계속 갱신한다.

**설계 기준:** `docs/superpowers/specs/2026-09-22-ems-catalog-ingestion-design.md`를 구현 원본으로 삼는다. MusicMoveArr torrent와 TIDAL 대형 dump는 사용하지 않는다. MusicBrainz core/canonical의 CC0 범위만 우선 사용하고, derived 장르·태그는 별도 라이선스 확인 전에는 읽지 않는다.

**실행 방식:** 현재 저장소에서 순차적으로 구현한다. 대형 원본은 `--work-root`로 지정한 개발 PC 외부 디렉터리에만 둔다. Zorin에는 checksum이 검증된 manifest와 애플리케이션 코드만 전달한다.

## Global Constraints

- 개발 PC의 원본 작업 루트와 저장소를 분리한다. 기본값은 사용자가 지정한 `MUSICBRAINZ_WORK_ROOT`이며 미지정이면 명시적 오류를 낸다.
- MusicBrainz `LATEST` 응답, `SHA256SUMS`, `.asc` 서명을 검증하고 실패하면 tar를 열지 않는다.
- tar 멤버 경로가 작업 루트 밖으로 탈출하면 추출하지 않는다. 원본·중간 파일·토큰·cookie·DB dump는 Git에 넣지 않는다.
- 후보 선별은 60% canonical score, 30% 연대·아티스트 지역 다양성, 10% recent/long-tail이며 deterministic seed와 artist 0.1%, release 5 cap을 사용한다.
- TIDAL resolver는 Client Credentials만 사용하고 사용자 OAuth token을 worker에 전달하지 않는다. raw query와 token을 로그에 쓰지 않는다.
- ISRC 일치가 우선이다. ISRC가 없으면 정규화된 title/artist/album과 duration ±2초를 모두 확인한다. 충돌·동률·KR `STREAM` 불충족은 `ambiguous` 또는 `not_found`로 격리한다.
- 429는 `Retry-After`를 존중하고, token expiry는 한 번 갱신한 뒤 재시도한다. 일일 요청 예산을 넘으면 새 요청을 만들지 않고 checkpoint를 저장한다.
- 모든 import는 manifest checksum과 `ON CONFLICT` 키로 멱등성을 보장하며, 중단 후 재실행해도 중복 EMS track이 생기지 않는다.
- 기존 `music_tracks`, `track_embeddings`, 사용자 101곡, taste profile과 사용자별 좋아요·싫어요를 변경하거나 삭제하지 않는다.
- 사용자별 영구 제외는 해당 사용자 추천 후보에만 적용하고 공용 EMS 원본에는 기록하지 않는다.
- 1,000곡 canary의 false-match 오프라인 검토와 rollback을 통과하기 전에는 공개 EMS에 노출하지 않는다.
- 디스크 70% 초과, DB pool 고갈, embedding service unhealthy 중 하나면 신규 승격을 멈추고 ingest run을 `paused`로 기록한다.

## Review Focus

- 최신 URL redirect, checksum/signature 불일치, 악성 tar 경로, header/schema 불일치가 DB 쓰기로 이어지지 않는지 확인한다.
- 같은 MBID/ISRC/TIDAL ID가 snapshot·재시도·사용자 import에 반복되어도 활성 EMS track은 하나인지 확인한다.
- ISRC 충돌과 제목만 같은 TIDAL 결과가 자동 승격되지 않고 quarantine에 남는지 확인한다.
- 429, token expiry, 프로세스 강제 종료 뒤 같은 checkpoint에서 이어지고 요청 budget을 초과하지 않는지 확인한다.
- cursor 위변조와 허용되지 않은 sort/filter가 API에서 400으로 끝나는지 확인한다.
- 사용자 A의 수락·싫어요·보관함이 사용자 B와 EMS 원본에 누출되지 않는지 확인한다.
- 70% 디스크/embedding 장애 시 partial promotion이 발생하지 않고 재실행 가능 상태로 남는지 확인한다.

## File Structure

| 경로 | 책임 |
|---|---|
| `apps/web/src/lib/db/migrations/008_ems_catalog.sql` | ingest run, candidate, EMS track/source/availability/embedding 스키마 |
| `apps/web/src/lib/db/migrations/008_ems_catalog.down.sql` | 008에서 만든 객체만 역순 제거 |
| `services/ems-pipeline/pyproject.toml` | Python 3.12 worker 의존성·명령 정의 |
| `services/ems-pipeline/src/ems_pipeline/musicbrainz.py` | LATEST 탐색, checksum/signature, 안전한 선택 추출 |
| `services/ems-pipeline/src/ems_pipeline/select.py` | canonical/diversity/long-tail 결정적 후보 선별 |
| `services/ems-pipeline/src/ems_pipeline/tidal.py` | Client Credentials, 검색·매칭·availability 검증 |
| `services/ems-pipeline/src/ems_pipeline/importer.py` | manifest 검증, staging import, checkpoint, promotion |
| `services/ems-pipeline/src/ems_pipeline/worker.py` | run lease, budget, retry, embedding enqueue, health stop |
| `services/ems-pipeline/tests/` | unit/integration 계약 테스트 및 fixture |
| `apps/web/src/lib/ems/catalog.ts` | 공개 EMS 목록과 cursor 검증 |
| `apps/web/src/lib/ems/catalog.test.ts` | 필터·cursor·중복·영구 제외 계약 테스트 |
| `apps/web/src/app/api/ems/catalog/route.ts` | EMS 페이지네이션 API |
| `apps/web/src/components/ems/ems-browser.tsx` | 실제 EMS catalog UI 연결 |
| `infra/compose.zorin.yml` | `ems-pipeline` private worker와 healthcheck |
| `docs/changes/2026-09-22-ems-catalog-ingestion.md` | 변경·검증·미검증·다음 작업 기록 |
| `docs/runbooks/ems-catalog-ingestion.md` | 1k canary, rollback, 10k gate, 지속 축적 운영 절차 |

## Implementation Tasks

### Task 1: DB 계약과 reversible migration 추가

**Files:** `apps/web/src/lib/db/migrations/008_ems_catalog.sql`, `.down.sql`

- `ems_ingest_runs`에 `run_type`, `snapshot_id`, `manifest_sha256`, `status`, `request_budget`, `requested_count`, `matched_count`, `error_code`, `started_at`, `finished_at`을 둔다. `run_type`은 `musicbrainz_snapshot|tidal_resolve|user_import`으로 제한한다.
- `ems_ingest_candidates`에 `candidate_key`, `recording_mbid`, `isrc`, canonical metadata, `selection_bucket`, `selection_score`, resolver status를 두고 `(run_id, candidate_key)`를 unique로 만든다.
- `ems_tracks`는 canonical identity와 TIDAL identity를 분리하고 `status`를 `candidate|active|stale|inactive|rejected`로 제한한다. `(tidal_id)`와 `(recording_mbid, isrc)` unique index로 공용 중복을 막는다.
- `ems_track_sources`, `ems_availability_events`, `ems_track_embeddings`는 source license, region/status, model revision과 input hash를 추적한다. 사용자 테이블과 FK를 만들지 않는다.
- `008_ems_catalog.down.sql`은 새 테이블·index·enum/check만 역순으로 제거한다.
- migration SQL에 “기존 user tables 보존” 회귀 fixture를 추가한다.

**Tests:** `apps/web/src/lib/db/migrations/008_ems_catalog.test.ts` 또는 현재 migration 검증 방식으로 index, check, down symmetry를 확인한다.

**Verify:** `npm --prefix apps/web test -- --run src/lib/db/migrations/008_ems_catalog.test.ts`와 staging PostgreSQL에서 up/down을 각각 실행한다.

### Task 2: MusicBrainz direct dump downloader와 선택 추출기

**Files:** `services/ems-pipeline/pyproject.toml`, `src/ems_pipeline/musicbrainz.py`, `tests/test_musicbrainz.py`

- `MusicBrainzSnapshotClient.download_latest(work_root: Path) -> SnapshotManifest`를 구현한다. 공식 fullexport의 `LATEST`, `SHA256SUMS`, 서명 파일, core dump와 canonical dataset URL을 HTTPS로 조회한다.
- HTTP 응답은 임시 `.part`로 받고 Range resume를 지원한다. `sha256`와 서명 검증이 성공한 후에만 immutable snapshot directory로 rename한다.
- `safe_extract_members(archive: Path, destination: Path, allowed: frozenset[str])`는 absolute path, `..`, symlink/hardlink 탈출을 거부하고 필요한 recording/ISRC/artist/artist_credit/release/release_group/medium/track/area 관계 테이블만 추출한다.
- `select` 명령은 raw dump를 `DuckDB`로 읽어 필요한 열만 `CSV.gz`로 만든다. 원본 전체를 DB에 적재하지 않는다.
- CLI는 `python -m ems_pipeline.musicbrainz download --work-root $env:MUSICBRAINZ_WORK_ROOT`와 `$snapshotId = (Get-Content (Join-Path $env:MUSICBRAINZ_WORK_ROOT 'LATEST.json') | ConvertFrom-Json).snapshot_id; python -m ems_pipeline.musicbrainz select --snapshot-id $snapshotId --work-root $env:MUSICBRAINZ_WORK_ROOT`를 제공한다. 환경변수 누락·공간 부족·검증 실패는 non-zero exit와 stable error code를 반환한다.

**Tests:** redirect/checksum/signature 실패, malicious tar member, Range resume, allowed table projection, re-run immutability를 `pytest` fixture로 고정한다.

**Verify:** 샘플 archive로 테스트 후 `python -m pytest services/ems-pipeline/tests/test_musicbrainz.py -q`를 실행한다. 실제 7GB 파일은 승인 이후에만 다운로드한다.

### Task 3: 후보 선별과 manifest/staging importer

**Files:** `src/ems_pipeline/select.py`, `src/ems_pipeline/importer.py`, `tests/test_selection.py`, `tests/test_importer.py`

- `CandidateSelector.select(rows: Iterable[CanonicalRow], limit: int, seed: int) -> list[Candidate]`가 60/30/10 bucket을 결정적으로 채우고 artist 0.1%, release 5 cap을 적용한다. 부족한 bucket은 다음 bucket으로 보충하되 총합과 cap을 유지한다.
- 출력은 `candidates.csv.gz`와 `manifest.json`이며 manifest에는 snapshot id, source license, schema version, row count, sha256, selector version, seed를 기록한다.
- `ManifestImporter.validate(manifest, csv_path) -> ValidatedManifest`는 header/order/count/checksum/source license를 DB 연결 전에 검증한다.
- `stage_candidates(run_id, candidates)`는 `COPY`/batch insert와 `(run_id,candidate_key)` conflict update를 사용한다. batch 중단 시 마지막 committed sequence를 checkpoint로 저장한다.
- `promote_match(candidate_id, tidal_match)`는 transaction 안에서 candidate, `ems_tracks`, source, availability를 함께 만들고 이미 active인 identity는 no-op으로 처리한다.

**Tests:** bucket 비율/seed 재현성, cap, malformed manifest zero-write, duplicate manifest, 중단 후 resume, promote atomicity와 rollback을 검증한다.

**Verify:** `python -m pytest services/ems-pipeline/tests/test_selection.py services/ems-pipeline/tests/test_importer.py -q`.

### Task 4: TIDAL Client Credentials 순차 resolver

**Files:** `src/ems_pipeline/tidal.py`, `tests/test_tidal.py`

- `TidalCatalogClient.get_token()`은 client credentials secret을 process env/file secret에서만 읽고 만료 30초 전 cache를 무효화한다.
- `search_candidate(candidate: Candidate) -> ResolveResult`는 artist/title/release 조합으로 검색하고 JSON:API 관계를 파싱한다. query string은 로그·DB에 저장하지 않는다.
- `match_result`는 ISRC exact match를 최우선으로 하고, 없을 때 normalized title/artist/album과 duration ±2초를 계산한다. 최고점이 threshold 미만이거나 동률이면 `ambiguous`로 반환한다.
- 매칭 뒤 `availability`를 조회하여 KR `STREAM`, playable, 30초 이상을 확인한다. 실패는 `not_found` 또는 `unavailable`로 격리한다.
- 429는 `Retry-After` 범위 내에서만 재시도하고, 5xx/network는 exponential backoff 후 `retryable`로 checkpoint한다. daily budget 초과는 `budget_exhausted`로 종료한다.

**Tests:** ISRC exact, normalized fallback, duration boundary, album mismatch, ambiguous tie, KR availability, 401 refresh, 429 Retry-After, budget stop, no raw secret/query logging을 mock HTTP로 고정한다.

**Verify:** `python -m pytest services/ems-pipeline/tests/test_tidal.py -q`.

### Task 5: worker lease, embedding enqueue, Compose private service

**Files:** `src/ems_pipeline/worker.py`, `src/ems_pipeline/health.py`, `tests/test_worker.py`, `infra/compose.zorin.yml`

- `run_worker(run_id, batch_size=50)`는 `FOR UPDATE SKIP LOCKED`로 candidate lease를 잡고 lease expiry를 갱신한다. 재시작 시 expired lease만 회수한다.
- `promote_match` 뒤 embedding job을 기존 embedding service queue 계약에 맞춰 enqueue하고 model id/revision/input hash를 EMS embedding 테이블에 기록한다. 실패한 embedding은 track 승격을 되돌리지 않고 retry 상태로 남긴다.
- 디스크 사용량, DB connectivity, embedding `/health/ready`, daily budget을 매 batch 전에 검사한다. 실패 시 run status를 `paused`로 저장한다.
- `ems-pipeline`은 backend network에만 연결하고 TIDAL egress를 허용한다. secrets는 `/home/approid/apps/music-pie/shared/secrets/ems.env`에서 주입하며 로그에 env 값을 출력하지 않는다.
- healthcheck는 마지막 heartbeat와 DB read-only query를 검증한다.

**Tests:** concurrent worker no double lease, crash/restart resume, health pause, embedding retry, secret omission, Compose network/healthcheck를 검증한다.

**Verify:** `python -m pytest services/ems-pipeline/tests/test_worker.py -q`; `docker compose -f infra/compose.zorin.yml config`.

### Task 6: 사용자 TIDAL import를 EMS staging으로 연결

**Files:** `apps/web/src/lib/ems/import-user-tracks.ts`, tests, existing playlist import integration

- 기존 사용자 playlist import는 사용자 library write를 유지하면서 `ems_ingest_candidates(run_type=user_import)`에도 provenance만 staging한다.
- 사용자가 허용한 TIDAL 권한 범위 밖의 catalog crawl은 하지 않는다. 사용자 token은 web request에서만 사용하고 worker secret/로그로 전달하지 않는다.
- 이미 EMS active인 TIDAL ID는 source provenance만 upsert하고, 사용자 private metadata와 행동은 EMS public row에 복사하지 않는다.

**Tests:** user import idempotency, provenance, token boundary, user A/B isolation, existing library regression.

**Verify:** `npm --prefix apps/web test -- --run src/lib/ems/import-user-tracks.test.ts src/lib/playlists/import-playlists.test.ts`.

### Task 7: EMS API와 UI를 실제 카탈로그에 연결

**Files:** `apps/web/src/lib/ems/catalog.ts`, `apps/web/src/app/api/ems/catalog/route.ts`, `apps/web/src/components/ems/ems-browser.tsx`, tests

- `listEmsTracks({ cursor, limit, region, genre, sort })`는 allow-list 정렬만 사용하고 HMAC 서명 cursor를 검증한다. cursor에는 snapshot/version, filter hash, expiry를 포함한다.
- API는 기본 `limit=24`, 최대 100, `status=active`, KR availability만 반환한다. 잘못된 cursor/filter는 400, DB 장애는 503으로 응답한다.
- UI는 기존 기능성 TrackCard/player를 사용하고 loading/empty/error/retry와 모바일 키보드 접근을 제공한다. 사용자 좋아요·싫어요는 개인 API로만 보낸다.

**Tests:** cursor tamper/expiry/filter mismatch, pagination duplicate, limit clamp, 400/503, user dislike exclusion, keyboard focus.

**Verify:** `npm --prefix apps/web test -- --run src/lib/ems/catalog.test.ts src/app/api/ems/catalog/route.test.ts src/components/ems/ems-browser.test.tsx`; `npm --prefix apps/web run build`.

### Task 8: GMS 후보·결정 추적과 score 연결

**Files:** `apps/web/src/lib/recommendations/gms.ts`, tests, migration extension if needed

- 추천 결정 테이블에 `source_track_id`, `profile_version`, `decision`, `reason_codes`, `score_components`, `created_at`을 기록한다. raw embedding input은 기록하지 않는다.
- score는 similarity 65%, canonical/TIDAL confidence·catalog priority 15%, freshness 10%, diversity 10%로 계산하고 각 component를 재현 가능하게 저장한다.
- 사용자 `dislike`는 해당 사용자 후보 query에서 `NOT EXISTS`로 영구 제외한다. 공용 active EMS 상태는 바꾸지 않는다.

**Tests:** score component sum, profile version, user isolation, permanent dislike, explanation codes, empty profile fallback.

**Verify:** `npm --prefix apps/web test -- --run src/lib/recommendations/gms.test.ts`.

### Task 9: local verification과 Zorin 1,000곡 canary

**Files:** `docs/changes/2026-09-22-ems-catalog-ingestion.md`, `docs/runbooks/ems-catalog-ingestion.md`, deployment test updates

- 모든 unit/integration/build 검사를 실행하고 결과·미검증 항목을 change log에 기록한다.
- 실행 전 개발 PC에서 `$env:MUSICBRAINZ_WORK_ROOT`가 저장소 밖이고 여유 공간이 충분한지 확인한다. `download` 후 `select`는 1,000개 limit manifest만 생성한다.
- Zorin에 코드와 manifest를 전달하고 `ems-pipeline --run-id canary-1k --limit 1000 --dry-run`으로 query budget과 예상 quarantine을 확인한다.
- live canary에서는 1,000개를 순차 resolve/import하고 import count, active count, duplicate count, quarantine count, embedding completion, KR playback sample 20개를 검증한다.
- false-match 오프라인 검토가 1% 미만이고 rollback rehearsal가 성공할 때만 EMS API를 공개한다. 실패 시 run을 quarantine하고 manifest 또는 resolver만 수정한다.

**Verify:** `docker compose -f infra/compose.zorin.yml config`; local test/build; SSH read-only health; canary report와 DB count query. 각 명령의 실제 출력만 완료로 기록한다.

### Task 10: 10,000 gate와 100,000 지속 축적 운영

**Files:** `docs/runbooks/ems-catalog-ingestion.md`, scheduler/worker config, monitoring tests

- 1k 결과의 false match, not found, unavailable, retryable 비율을 기준선으로 삼고 10k에서 악화되지 않는지 비교한다. 악화 시 자동 승격을 멈춘다.
- snapshot cadence는 공식 MusicBrainz 갱신 주기에 맞춰 `musicbrainz_snapshot` run을 만들고, 이전 snapshot과 `recording_mbid`/ISRC diff만 후보화한다.
- active EMS가 100,000에 도달하면 이후 run은 freshness/diversity 보충과 retired replacement를 우선하고 500,000 hard cap을 넘기지 않는다.
- runbook에 pause/resume, rollback, checksum failure, TIDAL 429, secret rotation, disk pressure, embedding outage와 연락·승인 절차를 기록한다.

**Verify:** 10k staging dry-run, scheduler duplicate-run test, cap/retire test, runbook 명령 smoke test. 실제 10k live run은 1k 보고서 승인 후 수행한다.

## Completion Checklist

- [ ] 008 migration up/down과 기존 사용자 데이터 보존 검증
- [ ] MusicBrainz checksum/signature와 safe extraction 테스트 통과
- [ ] deterministic candidate manifest와 idempotent importer 테스트 통과
- [ ] TIDAL matching/availability/429/budget 테스트 통과
- [ ] worker lease/restart/health/embedding 연결 테스트 통과
- [ ] API cursor와 UI 접근성 테스트 통과
- [ ] GMS score·사용자 영구 제외 테스트 통과
- [ ] local build와 Zorin 1k canary report 생성
- [ ] 1% 미만 false-match 및 rollback rehearsal 승인
- [ ] 10k gate 통과 후 100k 지속 축적 scheduler 활성화
