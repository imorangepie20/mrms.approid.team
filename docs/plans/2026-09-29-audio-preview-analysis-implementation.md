# 30초 프리뷰 취향 분석 구현 계획

## 1. 목표

EMS 트랙의 30초 프리뷰를 bounded worker로 분석해 설명 가능한 DSP feature, MAEST audio embedding, 필요한 MusiCNN high-level prediction을 저장한다. 사용자별 오디오 취향 프로필을 offline으로 계산하고, 기존 텍스트 GMS 추천과 독립된 shadow score를 거친 뒤 hybrid ranking을 단계적으로 활성화한다.

이 문서는 구현 순서와 파일 계약을 고정한다. 실제 preview 다운로드, 모델 설치, migration과 추천 점수 변경은 각 단계의 테스트와 운영 gate를 통과한 뒤 수행한다.

기준 설계: `docs/overview/taste-analysis-system.md`

## 구현 진행 상태

- 2026-09-29 단계 1의 입력·decode scaffold를 구현했다.
- 2026-09-29 단계 1의 모델 통합까지 구현했다. `essentia-dsp-v1`은 Essentia DSP, MAEST 2,304차원 L2 임베딩, MAEST top 10 style과 MusiCNN 9개 binary head의 18개 label 확률을 제공한다.
- `audio-preprocess-v1`은 preview SHA-256, request byte cap, 최대 30초, mono 16kHz decode, 10초 구간과 전체 신호 요약을 rollback 계약으로 유지한다.
- 서비스는 backend internal network에만 연결하고 egress network를 부여하지 않는다. concurrency는 1이며 non-root·read-only container로 실행한다.
- decode scaffold 기준 커밋 `d436199`와 모델 통합 기준 커밋 `bada8f3`를 Zorin에 배포했고 운영 health와 결정적 WAV 분석을 확인했다.
- 모델 artifact·metadata·Essentia wheel은 URL, byte 크기, SHA-256을 고정했다. startup load와 실제 shape·finite·norm·probability 검증을 통과해야 readiness와 분석 응답이 성공한다.
- 실제 30초 tone 컨테이너 smoke에서 cold 20.225초, warm 14.039초, 추론 중 약 1.88 GiB를 측정해 운영 상한을 3 GiB·2 CPU로 정했다.
- 2026-09-29 단계 2는 스키마 생성과 수동 실행형 bounded worker까지만 구현한다. 자동 스케줄과 전 카탈로그 일괄 처리는 관리자 관측·sample 검증 이후로 미룬다.
- 2026-09-29 단계 3의 관리자 관측 API와 화면을 구현하고 `e1bbe73` Web release로 Zorin에 배포했다. 활성 EMS 전체 coverage, version·오류·처리량, 트랙별 안전한 상세와 단일 track/version 재처리를 제공하며 desktop·`390x844`·키보드 동작과 운영 인증 경계를 확인했다.
- 단계 4 전에 실제 preview 형식과 실패 분포를 확인하기 위한 8곡 bounded sample cohort를 완료했다. 첫 실행은 7곡 완료·1곡 `analysis_preview_too_long`이었고, 실패 preview가 약 60.005초인 provider 정상 응답임을 확인했다. `db8c230`에서 byte·timeout·분석 sample 상한은 유지하면서 긴 preview의 앞 30초만 분석하도록 수정하고 실패곡을 재처리해 최종 8/8 completed를 확인했다.

## 2. 확정 결정

- 1차 DSP: Essentia Music Extractor 계열 알고리즘
- 1차 대표 임베딩: Essentia MAEST 30초 모델
- 1차 고수준 예측: 실제 필요한 label만 제공하는 Essentia/MusiCNN head
- 후속 실험: LAION-CLAP 계열은 별도 shadow model로 평가
- text 768차원과 audio model-native 벡터는 별도 공간으로 유지
- 원본 preview는 영구 저장하지 않음
- 분석은 offline, 추천 scoring은 저장된 결과를 사용하는 online hybrid
- 후보는 독립적으로 scoring하고 다양성은 selector에서 재정렬
- 현재 단계에서는 weighted sum을 사용하며 multi-action prediction은 도입하지 않음

## 3. 기존 코드에 대한 배치

현재 `services/embedding`은 768차원 텍스트 전용이고 운영 Web·EMS가 함께 사용한다. 오디오 모델 의존성과 자원 제한을 분리하기 위해 이 service를 확장하지 않는다.

```text
services/audio-analysis        새 stateless 분석 service
        ↑ internal HTTP
services/ems-pipeline          preview 수집, job claim, 결과 저장
        ↑ PostgreSQL
apps/web                      사용자 profile, GMS shadow/serving
apps/admin                    분석 상태와 모델·coverage 조회
```

`audio-analysis` service는 외부 URL을 직접 받지 않는다. EMS worker가 preview를 다운로드하고 byte·duration 제한을 확인한 뒤 internal network로 전달한다. 따라서 모델 service에는 egress network를 주지 않는다.

## 4. 추천 단계 계약

| 단계 | 구현 위치 | 입력 | 출력 |
|---|---|---|---|
| Source | `apps/web/src/lib/recommendations/candidates.ts` | 사용자·profile version | EMS 후보 ID 목록과 source code |
| Hydrator | `apps/web/src/lib/db/gms-recommendations.ts` | 후보 ID | metadata, text embedding, audio 결과, 사용자 결정 |
| Filter | `apps/web/src/lib/recommendations/filters.ts` | hydrated 후보 | 활성·재생 가능·비중복·비거절 후보 |
| Scorer | `apps/web/src/lib/recommendations/hybrid-score.ts` | 후보별 feature와 centroid | component score와 `baseScore` |
| Selector | `apps/web/src/lib/recommendations/selector.ts` | scored 후보 | diversity가 적용된 top K |
| SideEffect | `apps/web/src/lib/db/recommendation-impressions.ts` | 제공 결과 | 비동기 노출·score version 기록 |

Filter 순서는 `inactive → unavailable → permanent reject → duplicate recording → already selected duplicate`로 고정한다. 저비용·전역 조건을 사용자별·batch 조건보다 먼저 실행한다.

## 5. 단계 1: 분석 service scaffold

### 변경 파일

- 생성: `services/audio-analysis/pyproject.toml`
- 생성: `services/audio-analysis/Dockerfile`
- 생성: `services/audio-analysis/audio_analysis/main.py`
- 생성: `services/audio-analysis/audio_analysis/contracts.py`
- 생성: `services/audio-analysis/audio_analysis/preprocess.py`
- 생성: `services/audio-analysis/tests/test_contracts.py`
- 생성: `services/audio-analysis/tests/test_preprocess.py`
- 수정: `infra/compose.zorin.yml`
- 수정: `.dockerignore`

### API 계약

```text
GET /health/live
GET /health/ready
POST /v1/audio-analysis
Content-Type: audio/* 또는 application/octet-stream
Headers:
  X-Preview-Sha256
  X-Feature-Version
```

성공 응답:

```json
{
  "previewHash": "sha256",
  "durationSeconds": 30.0,
  "featureVersion": "essentia-dsp-v1",
  "features": {
    "whole": {},
    "segments": [{}, {}, {}],
    "summary": {}
  },
  "embedding": {
    "modelId": "essentia/maest-30s",
    "modelRevision": "pinned-revision",
    "dimensions": 0,
    "normalization": "l2",
    "values": []
  },
  "predictions": []
}
```

단계 1의 decode scaffold는 최종 모델이 아직 고정되지 않았으므로 다음 필드를 사용한다.

```json
{
  "featureVersion": "audio-preprocess-v1",
  "analysisStage": "preprocess",
  "sampleRate": 16000,
  "channelCount": 1,
  "features": {
    "whole": {},
    "segments": [{}, {}, {}],
    "summary": {"segmentCount": 3, "coverageRatio": 1.0}
  },
  "embedding": null,
  "predictions": []
}
```

이 중 신호 요약은 decode와 경계 검증용이며 `essentia-dsp-v1`의 최종 DSP feature로 취급하거나 DB에 저장하지 않는다.

`dimensions`는 MAEST 7번째 transformer layer의 CLS token, DIST token, 나머지 token 평균을 연결해 2,304로 고정한다. 응답은 finite value, dimensions, L2 norm, label vocabulary를 검증한 뒤에만 반환한다.

### 제한

- request byte hard cap: 기본 4MiB, 환경 변수로 더 작게만 조정해 canary 가능
- decode wall-clock timeout: 기본 20초
- 최대 30초 sample만 분석
- provider MP3의 codec padding은 최대 50ms까지만 허용해 정확히 30초로 trim하고, 그보다 긴 입력은 거절
- service concurrency 기본 1
- 단계 1 readiness는 FFmpeg decoder 사용 가능 시 200이다. 모델 연결 뒤에는 startup load 완료 조건을 추가한다.
- access log에 body, URL, provider token을 남기지 않음

### 테스트

- 440Hz tone, silence, white noise fixture의 deterministic DSP 결과
- 10초 미만·30초·30초 초과 입력 처리
- 손상 파일, 비지원 codec, byte cap, timeout 오류 코드
- embedding 길이·finite·L2 norm 검증
- 같은 byte와 version은 같은 hash·결과 생성
- Docker image non-root user와 offline model load

## 6. 단계 2: DB와 bounded job

### migration

- 생성: `apps/web/src/lib/db/migrations/023_ems_audio_analysis.sql`
- 생성: `apps/web/src/lib/db/migrations/023_ems_audio_analysis.down.sql`
- 생성: `apps/web/src/lib/db/migrations/023_ems_audio_analysis.test.ts`

### 제안 테이블

#### `ems_track_audio_jobs`

- `track_id` PK/FK → `ems_tracks`
- `preview_hash`, `feature_version`
- `status`: `pending`, `running`, `completed`, `retryable`, `failed`
- `attempt_count`, `claimed_at`, `lease_expires_at`, `next_attempt_at`
- `last_error_code`, `last_error_at`, `completed_at`, `created_at`, `updated_at`
- migration은 기존 39k 카탈로그를 자동 enqueue하지 않는다. worker 실행 시 `--stage-limit` 범위에서만 active track을 stage한다.

#### `ems_track_audio_features`

- PK: `track_id`, `feature_version`, `preview_hash`
- `duration_seconds`, `sample_rate`, `segment_count`, `coverage_ratio`
- `whole_features`, `segment_features`, `summary_features`, `dsp_features` JSONB
- `created_at`

#### `ems_track_audio_embeddings`

- PK: `track_id`, `model_id`, `model_revision`, `preview_hash`
- `dimensions`, `normalization`, `embedding vector`
- check: 실제 vector dimension과 `dimensions` 일치
- 1차 rollout에서는 모델 고정 전 ANN index를 만들지 않음

#### `ems_track_audio_predictions`

- PK: `track_id`, `model_id`, `model_revision`, `label`, `preview_hash`
- `probability`, `vocabulary_version`

low-level feature와 high-level prediction은 별도 version이므로 모델 head 변경만으로 DSP를 다시 계산하지 않는다.

### worker 변경 파일

- 생성: `services/ems-pipeline/src/ems_pipeline/audio_analysis.py`
- 생성: `services/ems-pipeline/tests/test_audio_analysis.py`
- 수정: `services/ems-pipeline/src/ems_pipeline/cli.py`
- 수정: `services/ems-pipeline/pyproject.toml`
- 수정: `infra/compose.zorin.yml`

### worker 계약

1. `FOR UPDATE SKIP LOCKED`로 lease 만료 또는 pending/retryable job을 claim한다.
2. 한 batch의 수와 전체 실행의 최대 batch를 모두 제한한다.
3. preview 응답 status, content type, byte와 duration을 검증한다.
4. SHA-256이 이미 completed이면 재사용한다.
5. audio service 응답을 검증하고 transaction으로 feature·embedding·prediction·job 완료를 저장한다.
6. timeout·5xx는 retryable, preview 없음·지원 불가 입력은 terminal failed로 분류한다.
7. 중단 시 처리하지 않은 claim을 원래 상태로 돌린다.

실제 preview 획득은 Web의 `apps/web/src/lib/tidal/playback-stream.ts`가 이미 사용하는 `/tracks/{id}/playbackinfo` 계약을 재사용하되 `assetpresentation=PREVIEW`, `audioquality=LOW`로 제한한다. 인증은 EMS의 기존 client-credentials token을 사용한다. 응답은 PREVIEW·HTTPS·unencrypted direct stream만 허용하고 DASH/HLS는 terminal unsupported로 닫는다. preview byte는 메모리에서만 다루며 URL·token·원본 음원을 DB와 로그에 남기지 않는다.

worker 기본값은 `--stage-limit 16 --batch-size 1 --max-batches 1 --max-attempts 5`로 제한한다. 네트워크·429·5xx는 지수 backoff가 있는 retryable, 없음·비지원 형식·크기 초과는 terminal failed로 분류한다. 같은 `preview_hash + feature_version`의 완료 결과는 전역 재사용하고, feature·embedding·prediction·job 완료는 한 transaction에서 저장한다. 분석 service 응답의 hash, version, stage, 16 kHz mono, 최대 30초, 2,304차원 finite L2 embedding과 probability 범위를 모두 검증하지 못하면 결과를 저장하지 않는다.

## 7. 단계 3: 관리자 관측

### API와 UI

- 생성: `apps/web/src/app/api/admin/audio-analysis/route.ts`
- 생성: `apps/web/src/app/api/admin/audio-analysis/[trackId]/route.ts`
- 생성: 대응 route test
- 생성: `apps/admin/src/pages/AudioAnalysis.tsx`
- 생성: `apps/admin/src/pages/AudioAnalysis.test.ts`
- 수정: `apps/admin/src/App.tsx`
- 수정: `apps/admin/src/components/layout/Sidebar.tsx`

관리자에는 다음을 표시한다.

- 전체 status count와 coverage
- feature/model version별 completed 수
- 처리량과 retry·terminal error code 분포
- 트랙별 preview hash, duration, DSP feature, prediction, dimensions
- cold/warm latency와 peak RSS benchmark 표본
- 재처리는 track ID와 version이 명시된 bounded 요청만 허용

원본 preview URL, provider token, signed stream URL은 응답과 로그에 포함하지 않는다.

### 2026-09-29 실행 설계

- `GET /api/admin/audio-analysis`는 활성 EMS 트랙을 기준으로 `missing`, `pending`, `running`, `completed`, `retryable`, `failed` 전체 상태 수와 stage/completed coverage를 반환한다.
- 같은 응답은 feature version별 완료 트랙 수, embedding/prediction model revision별 완료 트랙 수, 최근 7일 일별 완료량, retryable·failed error code 분포와 bounded pagination 트랙 목록을 제공한다.
- `GET /api/admin/audio-analysis/[trackId]`는 단일 UUID 트랙의 job, preview hash, duration, sample/segment coverage, DSP JSON, model id/revision/dimensions/normalization과 prediction을 반환한다. embedding 원본 vector는 관리자 응답에 포함하지 않는다.
- `POST /api/admin/audio-analysis/[trackId]`는 body에 `featureVersion`을 반드시 요구하고, 현재 worker가 지원하는 `essentia-dsp-v1` 단일 트랙만 `pending`으로 enqueue한다. batch ID, URL, 임의 model/version 또는 암묵적 전체 재처리는 허용하지 않는다.
- 재처리 enqueue는 기존 결과 row를 삭제하지 않고 job claim·attempt·error·completion 상태만 초기화한다. 실제 preview 다운로드와 분석은 기존 bounded worker가 수행한다.
- API와 관리자 화면에는 원본 preview URL, provider token, signed URL, embedding 원본 vector를 포함하지 않는다.
- 운영에서 이미 검증한 Zorin benchmark 표본(cold 20.225초, warm 14.039초, peak RSS 약 1.878 GiB)을 provenance와 함께 읽기 전용으로 표시한다.

### 단계 3 변경 파일과 의존 순서

1. `apps/web/src/lib/audio-analysis/admin.ts`에 aggregate/list/detail/requeue query와 응답 mapping을 구현한다.
2. `apps/web/src/app/api/admin/audio-analysis/route.ts`와 `[trackId]/route.ts`에 관리자 인증, bounded filter/body 검증과 오류 응답을 연결한다.
3. `apps/admin/src/lib/api.ts`에 민감 데이터가 없는 관리자 계약과 same-origin client를 추가한다.
4. `apps/admin/src/pages/AudioAnalysis.tsx`를 생성하고 `App.tsx`, `Sidebar.tsx`에 관측 화면을 연결한다.
5. repository·route·client·화면 테스트 후 Web/Admin lint·type/build와 전체 관련 회귀를 수행한다.

### 단계 3 완료 기준

- 활성 EMS 총계와 상태 합계가 일치하고 completed/staged coverage가 0 denominator에서도 안전하게 계산된다.
- feature/model revision별 완료 수, 최근 처리량과 retryable/failed 오류 분포가 DB 결과와 일치한다.
- 트랙 상세에서 preview hash·duration·DSP·prediction·embedding dimensions를 확인할 수 있고 원본 URL·token·signed URL·embedding vector는 응답에 없다.
- 재처리는 관리자 인증 뒤 단일 유효 UUID와 명시된 허용 feature version으로만 enqueue되며, 잘못된 ID/version/body와 비활성·없는 트랙은 거절된다.
- 관리자 화면은 loading/error/empty 상태, 수동 새로고침, status filter, 트랙 상세와 재처리 확인을 키보드와 모바일 폭에서 사용할 수 있다.
- 성공한 test·lint·build·운영 API/화면 검증만 변경 기록에 남긴다.

### 단계 3.1: bounded sample cohort 실행 설계

- 대상은 아직 audio job이 없는 active numeric-TIDAL 트랙 중 기존 worker의 결정적 정렬로 선택한 8곡이다.
- `--stage-limit 8 --batch-size 1 --max-batches 8 --request-budget 17`로 실행한다. 요청 예산은 client token 1회와 트랙별 playback info·preview 다운로드 각 1회를 넘지 않는다.
- concurrency는 1로 유지한다. 실행 전 관련 container health, 가용 메모리와 disk를 확인하고 실행 중에는 worker 출력과 host 자원을 관측한다.
- 429, provider 요청 예산 소진, service 5xx, host 자원 이상 또는 worker의 stop-run 신호가 발생하면 남은 claim을 반환하고 확대하지 않는다.
- 실행 후 job status·error code, duration·coverage·embedding dimension/norm·prediction 수, feature/model version과 container restart·오류 로그를 대조한다.
- cohort 결과는 품질·실패 분포를 측정하는 gate이며 전체 catalog 자동 enqueue나 scheduler 활성화를 포함하지 않는다. 숫자 activation 임곗값은 이 표본만으로 확정하지 않는다.
- 첫 실행 결과는 provider 요청 17/17, completed 7, terminal failed 1, retryable·released 0이었다. 완료 7곡은 모두 30초·16kHz mono·segment 3·coverage 1.0·2,304차원 L2 embedding·prediction 28개였다.
- 실패곡은 원본·URL을 저장하지 않는 메모리 pipe 진단에서 decoded 약 60.005초였다. 이는 codec padding이 아니라 TIDAL이 제공한 긴 `PREVIEW`이므로 입력을 거절하지 않고 FFmpeg `-t 30`으로 분석 sample을 제한한다. 4MiB request cap과 20초 decode timeout은 그대로 유지한다.
- 수정 배포 뒤 실패곡 한 건을 provider 요청 3회로 재처리해 completed로 전환했다. 표본 8곡과 기존 canary 1곡을 합친 운영 job 9건은 모두 completed이며 pending·running·retryable·failed는 0이다.

## 8. 단계 4: 사용자 오디오 프로필

### migration과 코드

- 생성: `apps/web/src/lib/db/migrations/024_user_audio_taste_profiles.sql`
- 생성: 대응 down SQL과 migration test
- 생성: `apps/web/src/lib/recommendations/audio-taste-profile.ts`
- 생성: `apps/web/src/lib/recommendations/audio-taste-profile.test.ts`
- 생성: `apps/web/src/lib/db/audio-taste-profiles.ts`
- 생성: `apps/web/src/lib/db/audio-taste-profiles.test.ts`

### 프로필 계약

- 텍스트와 동일한 playlist·artist·feedback weight 사용
- permanently rejected track은 입력에서도 제외
- completed이고 active model/version이 일치한 트랙만 사용
- text profile 성공 여부와 audio coverage 상태를 분리
- 전역 centroid는 항상 1개, cluster는 기존 60곡·최소 10곡·silhouette 조건을 재사용
- transaction 안에서 새 profile과 centroid를 완성한 뒤 active version 전환
- 실패 시 이전 completed version 유지

`coverage_ratio = analyzed_track_count / eligible_track_count`를 저장하되 activation 임곗값은 실제 cohort 분포를 측정한 뒤 결정한다.

### 2026-09-29 단계 4 실행 설계

- `user_audio_taste_profiles`는 사용자 FK, 독립 `profile_version`, feature·embedding·prediction·algorithm version, eligible/analyzed count, 생성 coverage, input fingerprint, weighted DSP·prediction summary와 completed 시각을 저장한다.
- `user_audio_taste_centroids`는 profile FK 아래 global index 0과 선택된 cluster 1..3을 2,304차원 vector로 저장한다. profile 또는 사용자 삭제 시 cascade하고 text 768차원 테이블과 결합하지 않는다.
- eligible 입력은 해당 사용자의 저장 TIDAL 트랙 중 active EMS와 연결된 트랙, TIDAL track 좋아요, GMS accept의 합집합이다. 어떤 경로로 들어왔든 그 사용자의 reject 이력이 있으면 제외한다.
- analyzed 입력은 eligible 중 `completed` job, `essentia-dsp-v1`, MAEST `essentia/discogs-maest-30s-pw-519l@2`, 2,304차원 L2 vector와 MusicNN revision 1·vocabulary 2의 18개 high-level label이 모두 있는 트랙만 사용한다.
- playlist 중복, artist 완화와 positive feedback 2배 가중치는 text profile과 같은 함수를 재사용한다. 오디오 global centroid는 analyzed 1곡 이상이면 만들고, cluster는 analyzed 60곡 이상·cluster별 10곡 이상·silhouette 0.10 이상일 때만 만든다.
- weighted summary는 BPM·beat confidence/count, RMS·peak·zero crossing·clipping, spectral centroid·rolloff·flatness, MFCC 평균, tonal key/mode 분포와 18개 high-level probability를 포함한다.
- fingerprint는 정렬된 track ID·preview hash·playlist/feedback weight와 모든 version identity를 SHA-256으로 계산한다.
- 새 profile·centroid·summary는 한 transaction에서 building → completed로 전환한다. 계산이나 저장 실패 시 기존 completed row와 centroids는 rollback으로 유지한다.
- 이번 단계는 repository와 명시적 refresh 함수를 제공하지만 GMS 조회·순서·응답과 사용자 요청 경로에는 연결하지 않는다. 운영 migration 뒤 실제 사용자와 분석 트랙의 교집합을 읽기 전용으로 확인하며, coverage가 없으면 profile을 임의 생성하지 않는다.

### 단계 4 변경 파일과 검증

1. `024_user_audio_taste_profiles.sql`·down SQL·migration test로 additive schema와 안전한 rollback을 고정한다.
2. `recommendations/audio-taste-profile.ts`와 test에 metadata 검증, 동일 가중치 centroid, summary, coverage와 fingerprint를 구현한다.
3. `db/audio-taste-profiles.ts`와 test에 사용자 격리 loader, 영구 거절 제외, exact-version join과 atomic replace·refresh를 구현한다.
4. opt-in PostgreSQL integration에서 24개 migration, user isolation, reject 제외, exact vector와 atomic replacement를 검증한다.
5. 관련·전체 Vitest, lint, production build, 격리 PostgreSQL migration/down restore를 통과한 뒤 additive migration과 Web release를 배포한다.

실행 결과는 `3f4fba3`과 `docs/changes/2026-09-29-user-audio-taste-profile-shadow.md`에 기록했다. 운영 024 schema와 명시적 refresh 기반은 배포했으며, eligible 6곡과 exact-version analyzed 트랙의 교집합이 0이라 profile 행은 만들지 않았다. GMS·사용자 요청·scheduler 연결은 단계 5 전까지 보류한다.

## 9. 단계 5: shadow ranking pipeline

### 변경 파일

- 생성: `apps/web/src/lib/recommendations/candidates.ts`
- 생성: `apps/web/src/lib/recommendations/filters.ts`
- 생성: `apps/web/src/lib/recommendations/hybrid-score.ts`
- 생성: `apps/web/src/lib/recommendations/selector.ts`
- 생성: 각 모듈 test
- 수정: `apps/web/src/lib/recommendations/gms.ts`
- 수정: `apps/web/src/lib/db/gms-recommendations.ts`
- 수정: `apps/web/src/app/api/recommendations/route.ts`

### shadow 동작

- 기존 production 결과는 그대로 반환한다.
- 같은 후보를 `hybrid-v0`로 계산하되 사용자 응답 순서는 바꾸지 않는다.
- candidate별 `text`, `audio`, `mood`, `rhythm`, `catalog`, `freshness`, selector 결과를 기록한다.
- profile version, audio model revision, 실제 fallback 여부를 함께 기록한다.
- shadow 기록 실패는 응답을 막지 않는다.

### 평가 항목

- audio feature·embedding coverage
- 분석 retry·terminal failure와 error code
- baseline과 hybrid의 overlap@K, rank displacement, score distribution
- 같은 아티스트 비중과 selector가 바꾼 항목 수
- 오디오가 없는 후보의 fallback 일관성
- 수락·스킵·싫어요별 component 분포
- model cold/warm latency, worker 처리량, peak RSS

숫자 gate는 사전에 발명하지 않는다. 실제 cohort baseline을 기록한 뒤 activation 문서에서 threshold와 rollback 기준을 확정한다.

### 2026-09-29 단계 5 실행 설계

- `025_recommendation_shadow_runs.sql`에 사용자별 shadow request와 candidate component를 분리해 저장한다. 원본 embedding·preview URL·token·DSP 원문은 저장하지 않고 track ID, text/audio profile version, model version, 순위, 정규화된 numeric component, reason code와 aggregate metric만 기록한다.
- Source는 현재 text profile query가 반환하는 동일한 최대 `limit × 5` 후보다. 기존 SQL의 active·KR STREAM·소유 playlist·accept/reject 제외 조건을 유지하고, pure Filter 모듈은 반환된 active·playable 상태와 중복 ID를 다시 검증하며 다른 source가 합류할 때 사용할 사용자 reject set 계약을 제공한다.
- Hydrator는 latest completed audio profile이 있으면 그 profile에 고정된 feature·MAEST·MusicNN version으로 후보의 audio centroid similarity, BPM과 high-level prediction을 붙인다. profile 또는 candidate audio가 없으면 값을 만들지 않고 component별 fallback으로 남긴다.
- `hybrid-v0` similarity는 문서의 text 0.45, audio 0.40, mood 0.10, rhythm 0.05를 사용 가능한 component 사이에서만 재정규화한다. mood는 채택한 10개 mood label probability의 평균 절대 차이를 0~1 similarity로 바꾸고, rhythm은 사용자·후보 BPM의 상대 차이를 0~1 similarity로 바꾼다.
- base score는 hybrid similarity 0.65, `match_confidence` catalog 0.15, freshness 0.10, `catalog_priority` editorial 0.10을 사용한다. activation gate가 아니라 비교용 고정 `hybrid-v0` 계약이다.
- Selector는 base score와 stable track ID로 정렬한 뒤 이미 선택된 같은 artist 후보에 기존 baseline diversity 감소량과 같은 `0.075`를 적용한다. candidate별 base rank, selected rank, repeated artist와 selector score를 기록한다.
- baseline은 기존 `rankEmsCandidates` 결과를 그대로 응답한다. shadow는 baseline top K와 hybrid top K의 overlap@K, 동일 후보 전체의 평균 rank displacement, 같은 artist 비중, selector가 top K를 바꾼 수, audio/mood/rhythm coverage와 fallback 여부를 계산한다.
- route는 Next.js `after()`에서 shadow insert를 실행한다. insert·transaction 실패는 내부에서 처리해 이미 반환한 추천 응답을 바꾸지 않는다. text profile이 없거나 후보가 0이면 불필요한 shadow row를 만들지 않는다.
- 이번 단계는 `GMS_RANKING_VERSION`을 추가하거나 hybrid를 serving하지 않는다. 운영에 audio profile이 없으면 text-only fallback 관측만 생기며, activation threshold·보관 기간·자동 정리 정책은 실제 cohort를 확인한 별도 결정으로 남긴다.

### 단계 5 변경 파일과 검증

1. `025_recommendation_shadow_runs.sql`·down SQL·migration test로 사용자 격리, cascade와 text/audio profile provenance를 고정한다.
2. `candidates.ts`·`filters.ts`·`hybrid-score.ts`·`selector.ts`와 unit test로 동일 후보, component fallback, deterministic selector와 aggregate metric을 고정한다.
3. `gms-recommendations.ts`가 baseline 응답과 별도 shadow payload를 만들고, repository test에서 exact audio version hydration과 transaction rollback을 검증한다.
4. recommendation route test에서 `after()` scheduling, 응답 불변과 side-effect 실패 격리를 검증한다.
5. 격리 PostgreSQL migration 25개·integration·down restore, 전체 Web Vitest·type·lint·build를 통과한 뒤 additive migration과 Web-only release를 배포한다.

실행 결과는 `41c4c2c`과 `docs/changes/2026-09-29-hybrid-recommendation-shadow-ranking.md`에 기록했다. 전체 Web 128개 파일·488개 테스트, 타입·lint·build와 두 차례의 격리 PostgreSQL 25 migration·integration을 통과했고 025 down이 기존 profile 테이블을 보존하는지 확인했다. 운영 backup 뒤 025와 Web release만 배포했으며 baseline 응답은 그대로다. 운영 audio profile과 인증된 자연 요청이 없어 shadow run·candidate 행은 0이다. 실제 cohort 없이 activation threshold를 만들지 않았고 보관 기간·자동 정리 정책도 단계 6 결정으로 남겼다.

## 10. 단계 6: 제한된 serving과 활성화

- `GMS_RANKING_VERSION=baseline|hybrid-v0` server setting으로 전환한다.
- 처음에는 관리자 또는 명시된 사용자 cohort만 hybrid를 사용한다.
- request에는 사용한 ranking version을 기록한다.
- 오류나 coverage 미달이면 request 단위로 baseline에 fallback한다.
- rollback은 migration down이 아니라 setting을 `baseline`으로 되돌리는 방식이 우선이다.
- serving 안정화 뒤에만 CLAP shadow 실험을 별도 model/version으로 추가한다.

### 2026-09-29 단계 6 안전 기반 실행 설계

- 이번 변경은 제한 serving을 위한 코드·schema·운영 설정 계약까지만 배포한다. 실제 shadow cohort와 activation threshold가 없으므로 production `GMS_RANKING_VERSION`은 설정하지 않아 `baseline`을 유지하고 사용자를 hybrid cohort에 넣지 않는다.
- 서버 전용 `GMS_RANKING_VERSION`, `GMS_HYBRID_AUTH0_SUBJECTS`, `GMS_HYBRID_MIN_AUDIO_COVERAGE`를 읽는다. ranking version이 정확히 `hybrid-v0`이고, 현재 subject가 명시적 allowlist에 있으며, 0보다 크고 1 이하인 coverage threshold가 설정된 경우에만 hybrid eligibility를 평가한다. 누락·오타·wildcard는 모두 baseline으로 fail closed한다.
- hybrid 선택에는 completed audio profile과 threshold 이상의 candidate audio coverage가 모두 필요하다. 하나라도 없으면 요청 단위로 baseline을 반환하고 `ranking_disabled`, `subject_not_allowlisted`, `coverage_threshold_unconfigured`, `audio_profile_unavailable`, `audio_coverage_below_threshold` 중 실제 fallback reason을 기록한다.
- `026_recommendation_serving_provenance.sql`은 shadow run에 requested/served ranking version, configured minimum audio coverage와 fallback reason을 추가하고, recommendation decision에 실제 served ranking version을 추가한다. 기존 row는 `baseline`으로 backfill하며 vector·token·URL·개인 설정 원문은 저장하지 않는다.
- baseline과 hybrid 응답은 같은 candidate hydrate 결과에서 만든다. baseline map은 기존 점수·순서 계약을 유지하고, hybrid map은 selected rank 순서, selector score, hybrid reason과 null을 제거한 numeric component를 사용한다. 응답과 결정에는 실제 `rankingVersion`을 명시한다.
- `/api/recommendations`와 실제 `/gms` 서버 페이지가 같은 prepare·selection 경로를 사용한다. 두 경로 모두 Next.js `after()`에서 serving provenance를 포함한 shadow 저장을 실행하고, side effect 실패는 응답을 바꾸지 않는다.
- 운영 배포에서는 새 환경 변수를 추가하지 않는다. 따라서 새 코드가 배포돼도 baseline 응답만 제공하며, rollback은 `GMS_RANKING_VERSION=baseline` 또는 변수 제거 후 Web만 재생성하는 방식이 우선이다.

### 단계 6 안전 기반 변경 파일과 검증

1. `026_recommendation_serving_provenance.sql`·down SQL·migration test로 기존 row backfill, version check와 additive rollback을 고정한다.
2. `recommendations/serving.ts`와 unit test로 설정 parser, allowlist, threshold, audio profile/coverage fallback과 결정적 선택을 검증한다.
3. `gms-recommendations.ts`와 repository test에서 baseline 불변, hybrid 응답 mapping, shadow serving provenance와 decision ranking version 저장을 검증한다.
4. recommendation route와 GMS page test에서 동일 선택, `after()` scheduling, 기본 baseline과 side-effect 실패 격리를 검증한다.
5. migration 26개·PostgreSQL integration·down restore, 전체 Web Vitest·type·lint·build를 통과한 뒤 production 설정은 baseline인 상태로 additive migration과 Web-only release를 배포한다.

실행 결과는 `696a215`와 `docs/changes/2026-09-29-hybrid-recommendation-serving-gate.md`에 기록했다. 전체 Web 131개 파일·501개 테스트, 타입·lint·48개 경로 build와 격리 PostgreSQL 26 migration·integration을 통과했고 026 down이 기존 shadow 테이블과 run을 보존하는지 확인한 뒤 재적용했다. 운영 backup 뒤 026과 Web release만 배포했으며 세 hybrid 환경 변수는 모두 미설정이라 `baseline`을 유지한다. 실제 `/gms` 페이지도 자연 방문 뒤 serving provenance를 기록할 수 있지만 운영 audio profile과 shadow 행은 아직 0이다. 실제 cohort 없이 allowlist·threshold를 설정하지 않았고 보관 기간·자동 정리 정책도 미확정으로 남겼다.

### 2026-09-29 단계 6.1: 사용자 eligible 6곡 bounded 분석과 profile 생성

- 운영 읽기 전용 조회에서 사용자는 1명이고, 선택 playlist·TIDAL 좋아요·GMS accept 합집합에서 영구 reject를 제외한 eligible EMS 트랙은 정확히 6곡이다. 6곡 모두 active·numeric TIDAL ID이며 기존 audio job은 없다.
- 기존 `analyze-audio`의 최신 active 트랙 선별과 전체 pending claim은 사용자 cohort 경계를 보장하지 못한다. CLI에 반복 가능한 `--track-id`를 추가하고 staging과 claim 양쪽에서 같은 UUID allowlist를 적용한다. 지정하지 않은 기존 동작은 유지한다.
- 실행은 대상 UUID 6개, `--stage-limit 6 --batch-size 1 --max-batches 6 --request-budget 13`으로 제한한다. 요청 상한은 token 1회와 곡별 playback info·preview 다운로드 각 1회를 합친 값이며 concurrency는 1이다.
- 실행 전 custom-format DB backup·checksum·`pg_restore --list`, container health, disk와 메모리를 확인한다. 429, 예산 소진, 분석 service 오류, host 자원 이상 또는 stop-run에서 남은 claim을 반환하고 확대하지 않는다.
- 결과는 정확한 6개 job의 completed 상태, preview hash, 30초·16kHz mono, segment·coverage, `essentia-dsp-v1`, MAEST 2,304차원 L2, MusicNN revision 1·vocabulary 2의 18개 label을 확인한다. 실패나 버전 불일치가 있으면 profile을 만들지 않는다.
- Web에는 인증된 사용자 본인의 `refreshAudioTasteProfile`만 호출하는 `POST /api/recommendations/audio-profile`과 GMS의 명시적 갱신 버튼을 추가한다. 다른 subject나 임의 user ID를 입력받지 않으며, 분석 0건은 write 없이 coverage 0으로 반환하고 내부 실패는 안전한 오류 코드로만 반환한다.
- 6곡 검증 뒤 해당 인증 세션에서 profile refresh를 1회 실행하고 eligible/analyzed count, coverage, completed 상태, centroid dimension만 확인한다. token·cookie·원본 vector·Auth0 subject는 출력하거나 문서화하지 않는다.
- `GMS_RANKING_VERSION`, `GMS_HYBRID_AUTH0_SUBJECTS`, `GMS_HYBRID_MIN_AUDIO_COVERAGE`는 계속 미설정으로 둔다. profile 생성은 baseline serving을 바꾸지 않으며 자연 GMS 요청에서 shadow cohort가 생긴 뒤에만 activation threshold를 별도로 결정한다.

실행 결과는 `b4f48dd`, `5d72f07`과 `docs/changes/2026-09-29-user-audio-profile-cohort.md`에 기록했다. 대상 6곡은 provider 요청 13/13으로 모두 exact-version 분석을 완료했고 실패·재시도·release는 없었다. 인증된 GMS에서 completed 6/6 audio profile과 2,304차원 global centroid를 만들었다. 새 profile을 참조한 자연 shadow는 생성됐지만 추천 후보 audio coverage가 0이므로 serving은 `ranking_disabled` baseline을 유지한다. 후보 카탈로그 확대와 activation threshold는 별도 단계로 남긴다.

### 2026-09-29 단계 6.2: GMS 상위 12곡 candidate audio shadow cohort

- 대상은 completed audio profile을 참조한 최신 자연 shadow run의 baseline rank 1..12다. 이는 현재 GMS 응답 한도와 동일한 실제 노출 후보이며 임의 activation threshold가 아니다.
- 실행 전 조회에서 shadow 후보는 총 60곡이고 exact-version audio 완료는 0곡이다. 상위 12곡은 모두 active·numeric TIDAL ID이고 기존 audio job이 없다.
- 정확한 12개 UUID를 반복 `--track-id`로 지정하고 `--stage-limit 12 --batch-size 1 --max-batches 12 --request-budget 25`로 실행한다. 요청 상한은 token 1회와 곡별 playback info·preview 다운로드 각 1회이며 concurrency는 1이다.
- 실행 전 새 custom-format DB backup·checksum·`pg_restore --list`, container health, disk와 메모리를 확인한다. 429, 예산 소진, 분석 service 오류, host 자원 이상 또는 stop-run에서 남은 claim을 반환하고 확대하지 않는다.
- 완료 조건은 정확한 12개 job 모두 completed, 30초·16 kHz mono·coverage 1.0, exact feature·MAEST embedding·MusicNN 18개 label이다. 실패나 버전 불일치가 있으면 자연 shadow 요청과 후속 확대를 진행하지 않는다.
- 후보 분석은 사용자의 profile 입력을 바꾸지 않으므로 profile refresh를 하지 않는다. 완료 뒤 인증된 GMS를 한 번 새로고침해 새 shadow를 만들고, candidate 60곡 중 audio·mood·rhythm coverage, overlap@K, 평균 rank displacement, selector 변경 수와 fallback을 이전 0-coverage run과 비교한다.
- `GMS_RANKING_VERSION`, `GMS_HYBRID_AUTH0_SUBJECTS`, `GMS_HYBRID_MIN_AUDIO_COVERAGE`는 계속 미설정이다. 이 1회 bounded cohort만으로 activation threshold를 확정하거나 hybrid를 serving하지 않는다.

실행 결과는 `docs/changes/2026-09-29-gms-candidate-audio-cohort.md`에 기록했다. exact baseline 상위 12곡은 provider 요청 25/25로 모두 분석됐고 전체 audio job은 completed 27건, 다른 상태 0건이다. 새 자연 shadow의 후보 60곡 중 audio·mood·rhythm coverage는 각각 0.2이며 overlap@K 1.0, 평균 절대 rank displacement 1.2, top K selector 변경 11건을 기록했다. profile refresh와 hybrid 환경 변경은 하지 않았고 serving은 `ranking_disabled` baseline을 유지한다.

### 2026-09-29 단계 6.3: GMS baseline rank 13..24 candidate audio cohort

- 20% coverage shadow에서 분석된 12곡의 hybrid score 범위는 0.768654..0.798808, 미분석 48곡은 0.731513..0.752628로 완전히 분리됐다. overlap@K 1.0이라 실제 audio 적합도와 component availability 효과를 아직 구분할 수 없다.
- 다음 대상은 같은 최신 자연 shadow의 baseline rank 13..24인 정확한 12곡이다. 모두 active·numeric TIDAL ID이고 기존 audio job이 없다. 인접한 동일 크기 cohort로 현재 top K 밖 후보가 audio component를 얻었을 때 진입하는지 확인하며 ranks 25..60은 건드리지 않는다.
- 정확한 12개 UUID를 반복 `--track-id`로 지정하고 `--stage-limit 12 --batch-size 1 --max-batches 12 --request-budget 25`로 실행한다. concurrency는 1이며 token 1회와 곡별 playback info·preview 다운로드 각 1회만 허용한다.
- 실행 전 새 custom-format DB backup·checksum·`pg_restore --list`, container health, disk와 available memory를 확인한다. 첫 429, request budget 소진, audio-analysis 오류, host 자원 이상 또는 stop-run에서 중단하고 cohort를 확대하지 않는다.
- 완료 조건은 정확한 12개 job 모두 completed, 30초·16 kHz mono·coverage 1.0, exact feature·MAEST 2,304차원 L2 embedding·MusicNN 18개 label이며, 전체 job에 pending·running·retryable·failed가 없어야 한다.
- 완료 뒤 profile refresh 없이 인증된 GMS 자연 방문 1회로 새 shadow를 만든다. 0%·20%·40% run의 coverage, overlap@K, 평균 rank displacement, top K selector 변경 수, baseline rank 13..24의 hybrid top K 진입 수와 score 분포를 비교한다.
- hybrid 환경 변수 세 개는 계속 미설정으로 둔다. 이 결과만으로 activation threshold·allowlist·보관 기간을 확정하거나 ranks 25..60을 자동 분석하지 않는다.

실행 결과는 `docs/changes/2026-09-29-gms-candidate-audio-cohort-2.md`에 기록했다. baseline rank 13..24의 12곡은 provider 요청 25/25로 모두 분석됐고 전체 audio job은 completed 39건, 다른 상태 0건이다. 40% coverage shadow는 overlap@K 0.5, 평균 절대 rank displacement 3.3666666666666667, top K selector 변경 12건이며 두 번째 cohort 6곡이 top 12에 진입했다. 다만 분석된 24곡과 미분석 36곡의 hybrid score 구간이 계속 완전히 분리돼 있어 추가 분석 전에 missing-component 재정규화와 calibration을 검토한다. profile refresh와 hybrid 환경 변경은 하지 않았고 serving은 `ranking_disabled` baseline을 유지한다.

## 11. 검증 순서

1. `services/audio-analysis`: unit test, fixture integration, image build, health
2. `services/ems-pipeline`: job·lease·retry·budget pytest
3. `apps/web`: migration, profile, filter, scorer, selector, API Vitest
4. `apps/admin`: route·화면 test, lint, build
5. clean source에서 Web·audio-analysis·EMS image build
6. 격리 PostgreSQL에 `023`, `024` migration과 rollback restore 검증
7. Zorin sample cohort에서 DSP/embedding benchmark와 결과 sanity check
8. shadow 결과 검토 뒤 별도 activation 결정

## 12. 배포 순서

1. code·test·build 완료 커밋을 로컬 작업 브랜치에 만들고, 준비가 끝나면 `main`에 fast-forward 병합한 뒤 `main`만 원격에 push한다. feature branch는 push하지 않는다.
2. 운영 DB custom-format backup과 checksum을 만든다.
3. `023` migration 적용 후 row count와 기존 EMS fingerprint를 확인한다.
4. audio-analysis image를 배포하고 internal health만 확인한다.
5. EMS worker를 제한된 batch와 report-only로 실행한다.
6. 관리자 관측이 일치하면 분석을 점진 확대한다.
7. `024`와 사용자 audio profile은 track 분석 품질 확인 뒤 별도 배포한다.
8. hybrid serving은 shadow 평가 승인 뒤 setting 전환으로 배포한다.

## 13. 완료 기준

- 동일 preview와 version의 분석 결과가 결정적이다.
- DSP, prediction, embedding이 모델별 version과 함께 추적된다.
- job lease·retry·중단 복구가 bounded test를 통과한다.
- text 768차원과 audio model-native dimension을 혼용하지 않는다.
- 영구 싫어요가 Source 이후 Filter와 사용자 profile 입력 양쪽에서 제외된다.
- 추천 응답에는 사용한 profile·ranking version과 score component가 남는다.
- shadow 기록과 다른 SideEffect 실패가 추천 응답을 막지 않는다.
- 기존 completed text profile과 baseline GMS가 audio 실패에도 계속 동작한다.
- 실제 성공한 test·build·migration·운영 결과만 변경 기록에 남는다.
