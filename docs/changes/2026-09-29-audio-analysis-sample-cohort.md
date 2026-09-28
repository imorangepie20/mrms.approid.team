# 오디오 분석 sample cohort와 긴 preview 보정

## 변경 이유

기존 실제 TIDAL 검증은 30초 preview 한 곡뿐이었다. 사용자 오디오 프로필을 만들기 전에 작은 cohort에서 preview 형식, 모델 결과, 실패 분포와 Zorin 자원을 확인할 필요가 있었다.

## 실행 범위

- active numeric-TIDAL 트랙 8곡만 stage했다.
- worker는 `--stage-limit 8 --batch-size 1 --max-batches 8 --request-budget 17`로 실행했다.
- concurrency는 1로 유지했고 자동 scheduler와 전체 catalog enqueue는 활성화하지 않았다.
- 실행 전 audio-analysis·EMS·PostgreSQL 등 관련 container health, disk와 메모리를 확인했다.

## 첫 결과와 원인

- worker 결과: claimed 8, analyzed 7, failed 1, retryable·released·reused 0, provider 요청 17/17.
- 완료 7곡은 모두 30초·16kHz mono·segment 3·coverage 1.0·2,304차원 L2 embedding·prediction 28개였다.
- 실패 코드는 `analysis_preview_too_long`이었다.
- 원본 preview, signed URL과 token을 저장·출력하지 않고 container 사이 메모리 pipe로 decoded sample byte만 측정했다. 해당 TIDAL `PREVIEW`는 약 60.005초였다.
- 원인은 codec padding이 아니라 provider가 정상적으로 60초 preview를 반환하는 경우를 서비스가 거절한 것이었다.

## 수정 내용

- 30초 초과 입력을 terminal 실패로 만들던 50ms tolerance 판정을 제거했다.
- FFmpeg `-t 30`으로 provider preview의 앞 30초만 decode해 분석한다.
- 4MiB request cap, 20초 decode timeout, mono 16kHz와 최대 480,000 sample 계약은 유지한다.
- 30.1초와 60.01초 입력이 모두 정확히 30초로 잘리는 회귀 테스트를 추가했다.

## 검증 결과

- 수정 전 회귀 테스트는 `preview_too_long`으로 실패했고 수정 후 통과했다.
- `services/audio-analysis`: 13개 pytest 통과.
- `services/ems-pipeline`: 74개 pytest 통과.
- local Docker image build 성공. non-root `appuser`·read-only container에서 60.01초 WAV가 30초·480,000 sample로 처리됐다.
- 수정 배포 뒤 실패곡 한 건만 pending으로 되돌리고 stage 없는 worker 호출을 provider 요청 3회로 실행했다. claimed 1, analyzed 1, 실패·재시도·반환 0이었다.
- 재처리 결과는 30초·16kHz·segment 3·coverage 1.0·2,304차원 L2 norm `0.9999999491`·prediction 28개다.
- 최종 운영 job은 completed 9, pending·running·retryable·failed 0이다.
- local/public readiness는 HTTP 200, 비로그인 관리자 화면은 307, 최근 audio-analysis·EMS 오류 로그는 0건이다.

## 배포와 rollback

- 기능 커밋: `db8c230`
- archive SHA-256: `b144b8ed7ce9e69257a865f2c51ed6687a0ebd19aadf82036b9284cc0caa9030`
- Zorin release: `/home/approid/apps/music-pie/releases/db8c230`
- 새 audio-analysis image: `sha256:c157de654c2353171bed4ac6afdeeac421728d0b5f4c1b1e97bdc6b4ca389232`
- rollback tag `music-pie-audio-analysis:pre-db8c230`: `sha256:8d9d8b69bcdad9bc672b875ae6b2b7eb7bca9b1118647ed63a127564688ec972`
- audio-analysis만 재생성했다. Web·PostgreSQL·embedding·EMS·source-routines·tunnel은 기존 container를 유지했다.

## 다음 작업

- 8곡 표본만으로 production activation 임곗값을 확정하지 않는다.
- 검증된 9곡 coverage를 사용해 사용자 오디오 프로필 schema와 계산 코드를 구현하되, text profile과 GMS serving은 변경하지 않는 shadow 단계로 진행한다.
