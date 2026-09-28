# 오디오 모델 아티팩트 통합

## 변경 이유

기존 `audio-preprocess-v1`은 decode와 입력 경계만 검증했고 취향 분석에 사용할 실제 DSP·임베딩·고수준 분류 결과는 생성하지 않았다. 가짜 벡터를 만들지 않으면서 재현 가능한 모델 결과를 제공하기 위해 공식 Essentia 모델을 고정 아티팩트로 통합했다.

## 변경 내용

- `services/audio-analysis/artifacts.json`에 Essentia wheel, MAEST, MusiCNN base, 9개 classification head와 metadata의 URL·byte 크기·SHA-256을 고정했다.
- image build는 아티팩트를 임시 파일로 받고 크기와 해시를 검증한 뒤에만 설치한다.
- runtime startup에서도 model·metadata 무결성을 다시 검증하고 전체 ONNX session load가 끝난 뒤에만 readiness를 연다.
- `essentia-dsp-v1` 계약을 추가했다.
  - Essentia rhythm, key/mode, spectral centroid·rolloff·flatness, MFCC 통계
  - `discogs-maest-30s-pw-519l-2` 7번째 transformer layer 기반 2,304차원 L2 임베딩
  - MAEST 519 vocabulary 중 top 10 확률
  - MusiCNN danceability, voice/instrumental, acoustic, electronic, aggressive, happy, relaxed, sad, party의 양쪽 label 확률 18개
- 모든 결과에 model id, revision, vocabulary version을 포함하고 shape·finite·norm·probability 범위를 검사한다.
- 30초보다 짧은 입력은 모델 입력에만 우측 0-padding하고 실제 `coverageRatio`는 원본 길이를 유지한다.
- `audio-preprocess-v1`은 rollback과 decode 진단용으로 계속 지원한다.
- 실제 추론 결과를 기준으로 `audio-analysis` 제한을 3 GiB·2 CPU, health `start_period`를 60초로 변경했다.

## 검증 결과

- `services/audio-analysis/.venv/Scripts/python.exe -m pytest -q`: 13 passed
- `python -m compileall -q services/audio-analysis/audio_analysis services/audio-analysis/scripts`: 성공
- `git diff --check`: 오류 없음
- `docker build --progress=plain -t music-pie-audio-analysis:model-integration services/audio-analysis`: 성공
- image ID: `sha256:d4d9b64ad25126ccffb26eb745b00c4c25d0671d769d208bdd8b9144209481ec`
- image size: 938,069,329 bytes
- non-root·read-only·`cap_drop: ALL` 조건에서 startup과 `/health/ready` 성공
- 30초 440 Hz WAV 실제 모델 추론 2회:
  - cold 20.225초, warm 14.039초
  - response 55,957 bytes
  - embedding 2,304차원, L2 norm 1.0
  - 두 실행 embedding SHA-256 일치: `91056c8567884426ea8f509c56b39dcfcc26b9ffef1be679c7a128aa331c72d1`
  - prediction 28개, DSP rhythm·key 결과와 error 없음
  - 추론 중 관측 memory 약 1.878 GiB, OOM 없음

## 미검증 항목

- 현재 테스트 입력은 합성 tone이다. 실제 TIDAL preview corpus의 feature 품질과 사용자 action 예측력은 후속 offline 평가 대상이다.
- Windows에서는 운영 절대경로 secret file이 없어 전체 Compose config를 확정하지 못했다. Zorin 배포 전 preflight에서 다시 검증한다.
- 사용자별 저장, profile 집계, hybrid GMS scoring은 아직 연결하지 않았다.

## 배포 결과

- 기능 커밋: `bada8f3`
- release: `/home/approid/apps/music-pie/releases/bada8f3`
- 운영 image: `sha256:dbbcad7125bcb3840edbff6565b57a2541a42951ea9c99fe692ce7fd625525ce`
- rollback image: `music-pie-audio-analysis:pre-bada8f3` → `sha256:422e8e8be6688af6fa8ba4a36f0cd1cc8eacf4375ee143b3d81f0a55bad417cf`
- container: `c7f4aa9b20cab3038d95412778d743c653568af90b8da083158a0c32da7ea735`
- 시작 시각: `2026-09-28T22:29:35.452871348Z`
- 실행 경계: UID 10002, read-only, `cap_drop: ALL`, backend network만 연결, memory 3 GiB, CPU 2
- 배포 후 health: `healthy`, OOM false, restart 0, 오류 로그 0건
- 운영 30초 440 Hz smoke:
  - 8.407초, response 55,957 bytes
  - `analysisStage: complete`
  - embedding 2,304차원, norm 1.0
  - embedding SHA-256 `91056c8567884426ea8f509c56b39dcfcc26b9ffef1be679c7a128aa331c72d1`
  - prediction 28개, BPM 90.9899, key A, DSP error 없음
  - 요청 후 memory 1.555 GiB, OOM 없음
- Web, EMS, embedding, PostgreSQL container ID가 배포 전후 동일함을 확인했다.

## 다음 작업

1. `023_ems_audio_analysis.sql`과 bounded preview worker를 구현한다.
2. 실제 preview corpus에 대해 feature coverage와 오류율을 shadow로 측정한다.
3. 사용자별 audio profile과 hybrid GMS shadow score를 연결한다.
