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

## 10. 단계 6: 제한된 serving과 활성화

- `GMS_RANKING_VERSION=baseline|hybrid-v0` server setting으로 전환한다.
- 처음에는 관리자 또는 명시된 사용자 cohort만 hybrid를 사용한다.
- request에는 사용한 ranking version을 기록한다.
- 오류나 coverage 미달이면 request 단위로 baseline에 fallback한다.
- rollback은 migration down이 아니라 setting을 `baseline`으로 되돌리는 방식이 우선이다.
- serving 안정화 뒤에만 CLAP shadow 실험을 별도 model/version으로 추가한다.

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

1. code·test·build 완료 커밋을 원격에 push한다.
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
