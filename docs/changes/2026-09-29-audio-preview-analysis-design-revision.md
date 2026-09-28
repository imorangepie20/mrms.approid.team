# 30초 프리뷰 취향 분석 설계 개정과 구현 계획

## 변경 이유

초기 설계는 오디오 대표 벡터를 텍스트와 같은 768차원으로 표현하고 10초 구간 임베딩 세 개를 평균하는 안이었다. 공개 구현을 대조한 결과 오디오 모델은 native dimension을 유지하고, 30초 전체 모델과 구간별 DSP의 역할을 분리하는 편이 실제 모델 계약과 운영 관측에 맞는다. 이를 기준 설계와 구현 순서에 반영했다.

## 변경 내용

- `docs/overview/taste-analysis-system.md`를 다음 기준으로 개정했다.
  - Essentia Music Extractor의 30초 분석과 AcousticBrainz의 low/high-level 분리 구조를 반영했다.
  - Essentia DSP, MAEST 30초 임베딩, 필요한 MusiCNN high-level head를 1차 스택으로 정했다.
  - LAION-CLAP은 1차 필수 의존성에서 제외하고 후속 shadow 평가 대상으로 두었다.
  - text 768차원과 audio model-native dimension을 별도 공간으로 유지한다.
  - 임의의 오디오 추론 시간 대신 target Zorin의 cold/warm p50·p95·peak RSS를 측정하도록 바꿨다.
  - Source → Hydrator → Filter → Scorer → Selector → SideEffect의 여섯 단계 추천 구조를 추가했다.
  - 후보별 점수는 독립적으로 계산하고 다양성은 Selector에서 재정렬하며 SideEffect는 응답을 막지 않도록 정했다.
- `docs/plans/2026-09-29-audio-preview-analysis-implementation.md`를 추가했다.
  - 별도 `services/audio-analysis` service, internal API, resource cap과 테스트 계약을 정의했다.
  - `023` EMS 오디오 분석과 `024` 사용자 오디오 프로필 migration을 단계로 분리했다.
  - EMS bounded worker, 관리자 관측, 사용자 centroid, shadow ranking, 제한 활성화의 파일 지도를 기록했다.
  - 실제 cohort baseline을 측정하기 전 성능·활성화 숫자를 발명하지 않도록 gate 수립 순서를 명시했다.
- 관리자 `/admin/taste-analysis` 요약을 같은 모델·차원·추천 단계로 갱신했다.
- 문서 인덱스에 구현 계획 링크를 추가했다.

## 검증 결과

- `apps/admin`: 관련 Vitest 1개 파일·2개 테스트 통과
- `apps/admin`: 전체 Vitest 4개 파일·9개 테스트 통과
- `apps/admin`: ESLint 오류 0건, 기존 템플릿 경고 38건
- `apps/admin`: TypeScript·Vite production build 성공
- `apps/web`: Next.js production build 성공, `/admin/[[...slug]]` route 확인
- 관리자 bundle에서 `MAEST 30s`, `model-native`, 구현 계획 경로 확인
- 저장소 `git diff --check` 성공

## 구현·미구현 경계

- 이번 변경은 설계 문서, 구현 계획과 관리자 읽기 화면을 갱신한다.
- preview 다운로드, Essentia·MAEST·MusiCNN 설치, audio-analysis service, DB migration과 hybrid GMS scoring은 아직 구현하지 않았다.
- 실제 모델 weight·revision·dimension은 모델 artifact를 고정하고 검증하는 구현 단계에서 확정한다.
- 실제 로그인 관리자 화면의 desktop/mobile 시각 검증은 남아 있다.

## 다음 작업

1. 구현 계획 단계 1의 `services/audio-analysis` scaffold와 deterministic fixture test를 작성한다.
2. 모델 artifact·revision·label vocabulary를 고정하고 clean Docker image build를 검증한다.
3. `023_ems_audio_analysis.sql`과 lease·retry가 있는 bounded worker를 구현한다.
