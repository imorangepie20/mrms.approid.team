# GMS candidate audio shadow cohort 2

## 이유

baseline 상위 12곡을 분석한 20% coverage shadow에서 분석된 후보의 hybrid score가 미분석 후보보다 모두 높았고 overlap@K는 1.0이었다. 현재 top K 안의 곡만 audio component를 가진 상태라 실제 오디오 적합도와 component availability의 영향을 분리할 수 없다. 따라서 같은 자연 shadow에서 바로 다음 baseline rank 13..24만 동일한 크기로 분석해 top K 진입과 순위 변화를 비교한다.

## 실행 설계

- 최신 20% coverage 자연 shadow의 baseline rank 13..24인 정확한 12개 UUID만 대상으로 한다.
- 12곡 모두 active·numeric TIDAL ID이고 실행 전 audio job이 없다.
- concurrency 1, 최대 12 batch, provider 요청 상한 25다.
- 실행 전 DB backup과 host·container health를 확인하고 첫 429·예산·service·resource stop 신호에서 중단한다.
- exact-version 12/12 완료 전에는 자연 shadow를 새로 만들거나 ranks 25..60으로 확대하지 않는다.
- profile refresh와 hybrid 환경 변수 변경은 하지 않는다.

## 실행 결과

실행 후 성공한 검증만 기록한다.

## 미검증 항목과 다음 작업

- 이 표본만으로 activation threshold, allowlist, 보관 기간 또는 자동 정리 정책을 확정하지 않는다.
- 40% coverage shadow를 이전 0%·20% run과 비교한 뒤 추가 cohort 필요성과 경계를 별도로 결정한다.
