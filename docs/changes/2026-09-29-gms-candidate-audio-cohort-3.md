# GMS candidate audio shadow cohort 3

## 이유

40% coverage shadow의 counterfactual 검토에서 raw component scale과 후보별 missing-component 재정규화가 부분 coverage 순위에 체계적인 uplift를 만드는 것을 확인했다. 가중치를 임의로 바꾸지 않고 100% coverage 평가를 향해 동일한 bounded cohort를 점진적으로 진행하되, partial coverage는 shadow 관찰에만 사용한다.

## 실행 설계

- 최신 40% coverage 자연 shadow의 baseline rank 25..36인 정확한 12개 UUID만 대상으로 한다.
- 12곡 모두 active·numeric TIDAL ID이고 실행 전 audio job이 없다.
- concurrency 1, 최대 12 batch, provider 요청 상한 25다.
- 실행 전 DB backup과 host·container health를 확인하고 첫 429·예산·service·resource stop 신호에서 중단한다.
- exact-version 12/12 완료 전에는 자연 shadow를 새로 만들거나 ranks 37..60으로 확대하지 않는다.
- profile refresh, score calibration과 hybrid 환경 변수 변경은 하지 않는다.

## 실행 결과

실행 후 성공한 검증만 기록한다.

## 미검증 항목과 다음 작업

- partial coverage shadow는 activation 근거로 사용하지 않는다.
- 60% coverage shadow와 text-only counterfactual을 비교한 뒤 다음 cohort 경계를 별도로 결정한다.
