# GMS candidate audio shadow cohort

## 이유

사용자의 eligible 6곡으로 completed audio profile을 만들었지만 최신 자연 GMS shadow의 추천 후보 60곡은 모두 미분석이라 audio·mood·rhythm coverage가 0이었다. profile 생성만으로는 실제 hybrid component와 순위 변화를 관찰할 수 없으므로, 현재 사용자에게 실제 노출된 baseline 상위 후보를 작은 범위로 분석할 필요가 있다.

## 실행 설계

- 최신 completed audio profile을 참조한 자연 shadow run의 baseline rank 1..12만 대상으로 한다.
- 정확한 12개 UUID를 `--track-id` allowlist로 stage·claim한다.
- concurrency 1, 최대 12 batch, provider 요청 상한 25다.
- 실행 전 DB backup과 host·container health를 확인하고 첫 429·예산·service·resource stop 신호에서 중단한다.
- exact-version 12/12 완료 전에는 자연 shadow를 새로 만들거나 대상 수를 확대하지 않는다.
- profile refresh와 hybrid 환경 변수 변경은 하지 않는다.

## 실행 결과

실행 후 성공한 검증만 기록한다.

## 미검증 항목과 다음 작업

- 이 표본만으로 activation threshold, allowlist, 보관 기간 또는 자동 정리 정책을 확정하지 않는다.
- 실제 component coverage와 순위 변화가 기록된 뒤 다음 cohort 크기와 중단 기준을 별도로 결정한다.
