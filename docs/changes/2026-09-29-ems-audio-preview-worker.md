# EMS 오디오 프리뷰 분석 worker

## 변경 이유

오디오 모델 service는 실제 DSP·MAEST embedding·prediction을 반환하지만 EMS 트랙의 TIDAL preview를 제한적으로 가져오고, 중복 없이 분석하며, 결과를 버전과 함께 저장하는 경로가 없었다. 전 카탈로그를 암묵적으로 처리하지 않으면서 실제 preview 한 건으로 end-to-end 계약을 검증할 bounded worker와 additive schema가 필요했다.

## 변경 내용

- `023_ems_audio_analysis.sql`에 네 테이블을 추가했다.
  - lease·retry·terminal 상태를 갖는 `ems_track_audio_jobs`
  - version·preview hash별 DSP와 구간 결과를 저장하는 `ems_track_audio_features`
  - 2,304차원 L2 vector를 저장하는 `ems_track_audio_embeddings`
  - model·revision·vocabulary별 확률을 저장하는 `ems_track_audio_predictions`
- migration은 기존 EMS 트랙을 자동 enqueue하지 않는다. worker의 `--stage-limit`만큼만 active 트랙을 stage한다.
- `ems-pipeline analyze-audio`를 추가했다. 기본값은 `stage-limit=16`, `batch-size=1`, `max-batches=1`, `max-attempts=5`, provider request budget 3이다.
- 기존 Web 재생 구현과 같은 `/tracks/{id}/playbackinfo` 계약을 `PREVIEW`·`LOW`로 사용한다. HTTPS direct stream과 무암호 audio만 허용하며 원본 preview·signed URL·token은 저장하거나 로그에 남기지 않는다.
- `FOR UPDATE SKIP LOCKED`, 5분 lease, 지수 backoff, 요청 예산 중단 시 남은 claim 반환, graceful interrupt 반환을 적용했다.
- 같은 `preview_hash + feature_version`의 완료 결과는 재추론 없이 복제한다.
- 분석 응답의 hash·version·stage·duration·16kHz mono·DSP·2,304차원 finite L2 vector·prediction 범위를 검증한 뒤 feature·embedding·prediction·job 완료를 한 transaction으로 저장한다.
- 실제 TIDAL MP3에서 관측한 codec padding은 최대 50ms만 허용해 정확히 30초로 trim한다. 30.1초 입력은 계속 `preview_too_long`으로 거절한다.
- EMS Compose에 internal `AUDIO_ANALYSIS_SERVICE_URL`과 healthy dependency를 추가했다.

## 검증 결과

- `python -m pytest -q` (`services/ems-pipeline`): 74 passed
- `services/audio-analysis/.venv/Scripts/python.exe -m pytest -q`: 13 passed
- `npm test` (`apps/web`): 117 files, 452 passed
- `npm test -- src/lib/db/migrations` (`apps/web`): 6 files, 10 passed
- `python -m compileall -q src tests` (`services/ems-pipeline`): 성공
- `docker build -t music-pie-ems-pipeline:test-audio-v2 services/ems-pipeline`: 성공
- `docker build -t music-pie-audio-analysis:test-padding services/audio-analysis`: 성공
- 임시 `pgvector/pgvector:0.8.6-pg16-bookworm` DB에 전체 23개 migration 적용: 성공
- 임시 DB에서 stage → claim → feature/vector/prediction 저장 → retry backoff: 성공
- `023` down migration 후 네 신규 테이블 제거와 기존 `ems_tracks` 보존: 성공
- `git diff --check`: 오류 없음

## 운영 배포

- 기능 커밋 `2ccd756`과 codec padding 보정 커밋 `f4a3402`를 `origin/codex/anonymous-playback-error`에 push했다.
- 최종 release: `/home/approid/apps/music-pie/releases/f4a3402`
- migration 전 backup:
  - `/home/approid/apps/music-pie/backups/pre-023-2ccd756.dump`
  - mode 600, 176,787,735 bytes
  - SHA-256 `ea9521f5bf21a269ff45c3c6c25b8d938885b56f99cda43b40cada6bca5f0ab1`
  - PostgreSQL container의 `pg_restore -l` 검증 성공
- `023_ems_audio_analysis.sql` 1건을 적용했고 `schema_migrations`는 23건이다. 적용 직후 신규 네 테이블은 모두 0행, active EMS는 기존과 같은 39,102건이었다.
- 최종 image:
  - audio-analysis `sha256:8d9d8b69bcdad9bc672b875ae6b2b7eb7bca9b1118647ed63a127564688ec972`
  - EMS `sha256:479e225686421fb401e9a902485b10bffe8da4c070ee614ad2024c32b2bc594d`
- rollback image:
  - `music-pie-audio-analysis:pre-padding-f4a3402` → `sha256:dbbcad7125bcb3840edbff6565b57a2541a42951ea9c99fe692ce7fd625525ce`
  - `music-pie-ems-pipeline:pre-padding-f4a3402` → `sha256:542e48c573bb87b55c4cb9171408cd3efc9233db7c28f6efe833912116ac2d9f`
  - migration은 additive이므로 worker rollback 때 새 테이블은 내리지 않는다.
- 첫 canary는 실제 240,788-byte `audio/mp3`의 codec padding을 30초 초과로 판정해 `analysis_rejected`로 fail-closed됐다. 50ms 허용·30초 trim 보정 후 같은 트랙을 재처리했다.
- 최종 실제 TIDAL preview canary:
  - job `completed`, preview hash 길이 64
  - duration 30.0초, 16kHz mono, segment 3, coverage 1.0
  - MAEST 2,304차원, normalization `l2`, norm 1.000000
  - prediction 28개, probability 범위 0.015629250556230545~0.984370768070221
  - 최종 job 집계 completed 1, failed/pending/running/retryable 0
- audio-analysis와 EMS는 healthy, restart 0, 새 컨테이너 오류 로그 0건이다.
- Web·PostgreSQL·embedding·EMS source-routines·tunnel container ID는 배포 전후 동일하다.
- local readiness는 `{"status":"ready"}`, public `https://mrms.approid.team/api/health/ready`는 HTTP 200이다.

## 미검증 항목

- 실제 preview corpus 검증은 한 트랙만 완료했다. codec·길이·지역 가용성이 다른 표본의 coverage와 오류 분포는 아직 측정하지 않았다.
- 자동 scheduler는 연결하지 않았다. 현재 worker는 명시적으로 호출해야 하며 기본 실행도 한 batch로 제한된다.
- 관리자 분석 관측, 사용자별 audio taste profile, hybrid GMS shadow score는 다음 단계다.

## 다음 작업

1. 관리자 API와 화면에 status·coverage·version·error code·트랙별 결과를 연결한다.
2. 작은 명시적 cohort로 preview coverage와 terminal/retry 오류 분포를 측정한다.
3. 검증된 audio 결과만 사용하는 사용자 profile과 hybrid shadow ranking을 구현한다.
