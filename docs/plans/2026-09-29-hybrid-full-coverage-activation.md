# hybrid full coverage·제한 활성화 완료 계획

## 목표

terminal audio 후보 제외 후 eligible candidate 60곡의 audio·mood·rhythm coverage를 100%로 만들고, 동일 후보 집합의 full-coverage shadow를 평가한다. 평가를 통과하면 partial coverage를 차단하는 fail-closed gate와 shadow 보관 정책을 배포하고 현재 사용자 한 명만 제한 활성화한다.

## 현재 기준

- 기준 shadow: `58c1ebf6-33e2-4c4d-9a78-be5515752225`
- candidate: 60곡
- analyzed/fallback: 35/25
- audio·mood·rhythm coverage: `35/60`
- terminal 제외: 1곡
- backfill: 1곡
- 실제 제공 baseline 12곡은 직전 40% shadow와 동일하다.
- production hybrid 환경 변수는 모두 미설정이다.

## 단계 1: candidate audio 완료

### cohort A

- 새 eligible text baseline의 미분석 rank `17, 28, 38..47` 정확한 12곡만 처리한다.
- UUID:
  - `4c9a4a5d-c76f-45be-9b5f-e78bf9ba61d0`
  - `503dc54b-54dc-487c-8c70-47c0f9cdc4fe`
  - `089a284b-d8a8-4a98-ba55-36c4105a45b0`
  - `bcd6f89e-d150-4243-a0ca-736d675614e2`
  - `e4bd97ac-fb4d-463a-8a2d-ce8db18cfedc`
  - `47b941af-e851-4d68-bda5-3fa1343d03e8`
  - `313ad14f-9df2-408f-8cbc-368e9358e883`
  - `8b2f2b11-f494-43fe-8bbf-535041683c44`
  - `7e7b6f3a-2936-415f-b059-16f730882839`
  - `981ac3b4-a3b9-4603-8685-447bd0928531`
  - `34ecfb81-0e53-4257-986b-27eea3dd4cd8`
  - `d0ad1a2d-f6b9-4de2-a8ab-c94e90a6fbad`
- `--stage-limit 12 --batch-size 1 --max-batches 12 --request-budget 25`를 사용한다.
- 완료 뒤 로그인 GMS 방문 1회로 자연 shadow를 만들고 coverage `47/60`을 확인한다.

### cohort B

- cohort A의 completed와 terminal 제외가 모두 새 자연 shadow에 반영되고 retryable·running이 0인 경우에만 다음 미분석 rank 12곡을 다시 산출한다.
- 같은 `12/1/12/25` 상한을 사용한다. cohort A에서 새 terminal 1곡이 추가돼 완료 뒤 목표 coverage는 `58/60`이다.

### cohort C

- cohort B 뒤 남은 미분석 후보를 새 shadow에서 다시 산출한다.
- 현재 예상은 2곡이며 `--stage-limit 2 --batch-size 1 --max-batches 2 --request-budget 5`를 사용하고 coverage `60/60` shadow를 확인한다.

### cohort A 실행 후 재계획

- cohort A는 12곡 중 11곡 completed, `Above The Clouds` 한 곡이 새 `preview_forbidden` terminal 상태로 끝났다. 요청은 24/25이고 retryable·released는 없다.
- 새 shadow `e4905615-bc10-4ac5-b1e4-5efe0e1e0575`는 terminal 2곡·backfill 2곡·coverage `46/60`을 기록했다.
- 따라서 cohort B는 새 rank `47..58`의 정확한 12곡으로 확정한다. UUID는 `efbd8ca5-0291-419d-937f-fd11af97d0e9`, `fabb6442-9a98-45fb-9b8f-0da3527dd23a`, `91548438-c92c-42ed-a275-7f9746bd33a0`, `0d705faa-fc54-4cdd-9693-3f7ac8d48187`, `55c2298f-3e06-41ef-b269-205eef9f7adf`, `890fc975-a728-4e09-8be0-3765ce4be4bc`, `499bf80e-b0bf-4bc1-ab03-0366222341f1`, `37c71a3a-7c00-456d-a714-6d267d58cdbd`, `4cb3c510-caf2-49f4-880e-942709f91496`, `c0da3836-fb38-4160-be56-e3342af61e19`, `a6315e21-e70d-4d2e-b94f-722f5eea3381`, `119a03ae-7f47-4438-9d8d-646afc2a79b7`이다.
- cohort C는 남은 rank `59..60` 두 곡으로 바뀌며 `--stage-limit 2 --batch-size 1 --max-batches 2 --request-budget 5`를 사용한다.
- cohort B 실행 중 source routine이 `Bülbülüm Altın Kafeste`, `Through It All There's You`를 active·KR STREAM 후보로 새로 갱신해 candidate set이 두 곡 교체됐다. cohort B 12/12 완료 뒤 shadow `1aa2f01f-be00-4687-825c-61e261ecdf33`의 coverage는 `57/60`이다.
- 최종 cohort C는 이 새 shadow의 미분석 세 곡 `6b4bba44-8163-456c-bfdb-866042fcea15`, `1857cb15-48ab-4823-96e8-18164b7f8882`, `f372b186-3697-4c9b-a77a-a994a065d7ba`로 다시 확정한다. `--stage-limit 3 --batch-size 1 --max-batches 3 --request-budget 7`을 사용한다.
- catalog가 계속 갱신되므로 100% coverage는 시점별 snapshot 조건이다. 활성화 gate는 이후 새 미분석 후보가 들어오면 즉시 baseline으로 fallback해야 한다.

### 공통 중단 조건

- 각 cohort 전 custom-format DB backup·SHA-256·`pg_restore --list`, container health, disk와 available memory를 확인한다.
- 429, request budget 소진, retryable·failed·released, audio-analysis 오류, host 자원 이상에서 중단한다.
- 완료곡은 30초·16 kHz mono·segment 3·coverage 1.0, exact feature version, MAEST 2,304차원 L2, MusicNN 18개 label을 모두 충족해야 한다.
- 사용자 audio profile은 candidate 분석으로 바뀌지 않으므로 갱신하지 않는다.

## 단계 2: full-coverage 평가

- 같은 60곡에서 text-only baseline과 full hybrid의 top 12, overlap@K, 평균 rank displacement, Selector 변경 수, artist 반복률을 비교한다.
- component별 min·max·평균과 text-only 대비 hybrid base score delta, 상승·하락 수를 기록한다.
- null component·fallback·version 불일치·terminal track candidate 행이 없어야 한다.
- 사용자 판단 label이 없으므로 가중치는 변경하지 않는다. full coverage가 순위 가용성 편향만 제거했는지 확인한다.

## 단계 3: fail-closed serving gate

- serving 결정은 completed audio profile과 audio·mood·rhythm coverage가 모두 정확히 1일 때만 hybrid를 허용한다.
- 세 component 중 하나라도 1 미만이면 `component_coverage_incomplete`로 baseline fallback하고 provenance를 저장한다.
- 기존 ranking disabled·allowlist·threshold 미설정 경계와 baseline 응답 계약을 유지한다.
- 단위·route·page·repository·PostgreSQL migration 통합 테스트를 추가한다.

## 단계 4: 제한 활성화 결정

- full coverage·exact version·fallback 0·서비스 health·평가 결과가 모두 통과한 경우에만 현재 인증 사용자 한 명을 allowlist한다.
- `GMS_RANKING_VERSION=hybrid-v0`, 해당 subject allowlist, `GMS_HYBRID_MIN_AUDIO_COVERAGE=1`을 적용한다.
- 설정 후 로그인 GMS에서 requested/served `hybrid-v0`, fallback null과 12곡 렌더링을 확인한다.
- 조건을 충족하지 못하면 baseline 유지 결정을 완료 결과로 기록하고 활성화하지 않는다.

## 단계 5: shadow 보관 정책

- 운영 run 수·사용자 수·일별 생성량을 확인해 근거를 기록한다.
- 사용자별 최신 관찰을 충분히 남기면서 무제한 증가를 막는 cleanup 함수를 migration으로 추가한다.
- cleanup은 shadow run/candidate만 삭제하며 recommendation decision·profile·EMS 데이터는 건드리지 않는다.
- dry-run 집계와 실제 적용 범위를 분리하고, 배포 후 오래된 대상 수와 보존 수를 검증한다.

## Git·배포

- 구현·검증은 local feature branch에서 커밋한다.
- feature branch는 원격에 push하지 않는다.
- 준비가 끝나면 local `main`에 fast-forward하고 `main`만 push한다.
- 운영 backup 뒤 additive migration, Web·EMS image와 필요한 설정만 배포한다. 다른 container는 유지한다.

## 실행 결과

- cohort A는 12곡 중 11곡을 완료했고 `Above The Clouds` 1곡을 `preview_forbidden` terminal로 분류했다. cohort B는 12/12를 완료했다. source routine으로 후보 두 곡이 교체되어 cohort C를 새 미분석 3곡으로 다시 산출했고 3/3을 완료했다.
- 각 cohort 전 custom-format backup·SHA-256·`pg_restore --list`를 확인했다. provider 요청은 각각 24/25, 25/25, 7/7이고 retryable·released 결과는 없다.
- 최종 자연 shadow `6b0f8471-0cae-4a4f-a748-e984c080a3a6`은 candidate 60, terminal 제외 2, backfill 2, audio·mood·rhythm coverage 모두 `60/60`이며 fallback 후보와 null component가 없다.
- full hybrid와 text baseline의 top 12 overlap은 0.5, 평균 절대 rank displacement는 10.966666666666667, Selector 변경 수는 12, 같은 artist 비율은 0이다. hybrid base top 12와 Selector top 12의 구성은 동일하므로 이번 교체는 Selector가 아니라 component 결합에서 발생했다.
- text-only counterfactual 대비 hybrid base score delta는 평균 0.022935270453245636, 59곡 상승·1곡 하락이다. 사용자 label이 없으므로 가중치는 변경하지 않고 현재 사용자 한 명에만 canary를 허용한다.
- serving은 audio·mood·rhythm coverage가 모두 정확히 1일 때만 hybrid를 허용한다. 하나라도 미달이면 `component_coverage_incomplete`로 baseline fallback한다.
- shadow는 진단 데이터이므로 최대 30일, 사용자별 최신 100회만 보관한다. 저장 transaction에서 해당 사용자 범위만 자동 정리하며 별도 preview 함수로 삭제 대상을 먼저 확인할 수 있다.
- 임시 PostgreSQL에서 migration 28개 전체 적용, cleanup preview 2건·삭제 2건·100건 보존, 028 down/up을 검증했다. Web 전체 134개 파일·515개 테스트, lint 오류 0, production build·TypeScript·49개 route 생성을 통과했다.

