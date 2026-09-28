# 오디오 분석 service decode scaffold

## 변경 이유

30초 프리뷰 분석의 모델과 DB를 연결하기 전에 입력 경계, preview identity, decode 결과와 오류 계약을 독립적으로 검증할 수 있는 내부 service가 필요했다. 모델 artifact가 고정되지 않은 상태에서 임의 임베딩이나 prediction을 생성하지 않고 decode 단계만 실제 동작하도록 범위를 제한했다.

## 변경 내용

- `services/audio-analysis` FastAPI service를 추가했다.
- `POST /v1/audio-analysis`는 `audio/*` 또는 `application/octet-stream`, `X-Preview-Sha256`, `X-Feature-Version: audio-preprocess-v1`을 요구한다.
- request는 기본 4MiB로 제한하고 실제 byte SHA-256을 header와 대조한다.
- FFmpeg를 subprocess argument 배열과 stdin/stdout pipe로 실행해 mono 16kHz float32로 decode한다.
- 입력은 최대 30초이며 decode timeout 기본값은 20초다.
- 전체와 최대 세 개의 10초 구간에 대해 RMS, peak, DC offset, zero crossing, clipping 비율을 결정적으로 계산한다.
- 현재 응답은 `analysisStage: preprocess`, `embedding: null`, `predictions: []`로 모델 미연결 상태를 명시한다.
- 오류는 `preview_too_large`, `preview_hash_mismatch`, `preview_decode_failed`, `preview_decode_timeout`, `preview_too_long`처럼 안정된 코드로 반환한다.
- container는 UID 10002 non-root, read-only filesystem, capability 제거, `no-new-privileges`, concurrency 1로 구성했다.
- Compose에서 `backend` internal network만 연결해 외부 egress를 허용하지 않았다.

## 검증 결과

- 로컬 pytest: 8개 테스트 통과
- 440Hz tone, silence, 고정 seed white noise 결과의 결정성 확인
- 5초·30초 입력 성공과 30초 초과·손상 입력 거절 확인
- Docker image build 성공
- container health 응답 `{"status":"ready","stage":"preprocess"}` 확인
- container 실행 UID `10002` 확인
- container 내부에서 생성한 1초 440Hz WAV 분석 HTTP 200, duration 1.0초, RMS `0.35354234`, `embedding: null` 확인

## 구현·미구현 경계

- 이 단계의 신호 요약은 decode 계약 검증용이며 Essentia 최종 DSP feature가 아니다.
- Essentia, MAEST, MusiCNN package와 model weight는 아직 image에 포함하지 않았다.
- preview 다운로드, EMS job·DB migration, 사용자 audio profile과 GMS hybrid ranking은 아직 연결하지 않았다.
- 실제 preview 또는 provider token은 저장하거나 로그로 남기지 않는다.

## 다음 작업

1. Essentia·MAEST·MusiCNN artifact, revision과 label vocabulary를 고정한다.
2. offline model load와 finite·dimension·L2 norm 검증을 추가한다.
3. `023_ems_audio_analysis.sql`과 bounded EMS worker를 구현한다.
