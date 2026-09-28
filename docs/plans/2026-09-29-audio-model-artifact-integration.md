# 오디오 모델 아티팩트 통합 계획

## 목표와 완료 기준

`services/audio-analysis`의 decode scaffold를 실제 Essentia DSP, MAEST 임베딩, MusiCNN 분류 추론으로 확장한다. 구현 완료는 다음 조건을 모두 만족할 때로 정의한다.

- 30초 이하 preview를 mono 16 kHz로 decode하고, 입력이 짧으면 모델 입력에만 우측 0-padding을 적용한다.
- `essentia-dsp-v1` 응답에 설명 가능한 DSP, 2,304차원 L2 정규화 MAEST 임베딩, 고정 vocabulary의 MusiCNN 확률을 반환한다.
- 모델·metadata·Python wheel은 URL, byte 크기, SHA-256을 저장소 manifest에 고정하고 이미지 build 때 검증한다.
- startup에서 전체 모델을 load·검증한 뒤에만 readiness가 성공한다. runtime에는 외부 network를 부여하지 않는다.
- 동일 입력의 결과 결정성, 배열 shape·finite value·L2 norm·확률 범위를 자동 검증한다.
- 실제 컨테이너 cold start, warm inference, peak memory를 측정한 뒤 운영 자원 상한을 정한다.
- 기존 `audio-preprocess-v1` 계약은 rollback 경로로 유지한다.

## MLE iteration compact

### 예측 계약

- 입력: 최대 4 MiB의 audio byte, SHA-256, feature version
- decode: mono, 16 kHz, float32, 최대 30초
- 출력:
  - DSP: tempo/confidence, key/mode/strength, spectral·MFCC 통계와 per-family error
  - embedding: `discogs-maest-30s-pw-519l-2`, 7번째 transformer layer의 CLS·DIST·나머지 token 평균을 이어 붙인 2,304차원 L2 벡터
  - prediction: MAEST top style label과 MusiCNN 9개 binary head의 label별 평균 확률
- 실패 정책: load·shape·finite·normalization 검증 실패 시 가짜 값이나 0-vector를 반환하지 않고 안정된 오류 코드로 실패한다.

### 데이터·아티팩트 계약

- 원본 preview는 요청 처리 뒤 보관하지 않는다.
- 짧은 preview의 실제 coverage와 모델 padding은 구분해 기록한다.
- 모델 파일은 `services/audio-analysis/artifacts.json`의 정확한 크기와 SHA-256으로 검증한다.
- 모델 id, revision, vocabulary version을 모든 임베딩·예측 결과에 포함한다.
- 사용자별 취향 결합과 DB 저장은 이 단계 범위 밖이며, 후속 bounded worker에서 별도로 구현한다.

### 품질·운영 gate

- unit: artifact hash/size, response contract, 잘못된 model 결과 거부
- integration: 실제 ONNX load, 30초 deterministic fixture의 연속 2회 결과 일치
- runtime: non-root, read-only, concurrency 1, backend-only network, 외부 다운로드 없음
- 배포: 기존 audio-analysis image tag를 보존하고 새 service만 교체한다. health 또는 실제 inference 실패 시 이전 image로 복구한다.

정확도 수치는 이 통합 단계에서 주장하지 않는다. 후속 offline 평가에서 사용자 action과 독립적인 holdout 기준을 정의한 뒤 모델·feature version별로 비교한다.

## 변경 순서

1. artifact manifest와 hash 검증 downloader를 추가한다.
2. DSP와 ONNX analyzer를 구현하고 typed response 계약을 확장한다.
3. 단위 테스트와 실제 모델 통합 smoke를 수행한다.
4. 실측 결과로 Compose 자원 제한과 health start period를 조정한다.
5. 변경·검증·미검증 항목을 `docs/changes/`에 기록한다.
6. 커밋·푸시 후 Zorin에서 audio-analysis만 배포하고 회귀 확인한다.
