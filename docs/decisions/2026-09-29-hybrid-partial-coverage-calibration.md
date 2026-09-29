# hybrid-v0 부분 coverage calibration 결정

날짜: 2026-09-29

## 결정

- `hybrid-v0`의 text 0.45·audio 0.40·mood 0.10·rhythm 0.05 가중치와 현재 계산식을 이 표본만으로 변경하지 않는다.
- audio·mood·rhythm이 일부 후보에만 있는 shadow는 관찰용으로만 사용하고 hybrid serving 활성화 근거로 사용하지 않는다.
- hybrid serving 전에는 요청 후보 전체의 audio·mood·rhythm coverage 1.0을 fail-closed 조건으로 고정해야 한다. 현재 gate가 1 미만의 `GMS_HYBRID_MIN_AUDIO_COVERAGE`를 허용하는 것은 활성화 전 해결할 blocker다.
- 100% coverage shadow를 만들기 위한 후보 분석은 기존처럼 12곡 단위·concurrency 1·명시적 UUID allowlist·provider request budget 25로만 점진 진행한다. 각 단계는 별도 backup·검증·중단 기준을 갖고 자동 확대하지 않는다.
- 100% coverage에서 같은 candidate set의 score·순위·사용자 판단을 확인하기 전 activation threshold와 component calibration을 확정하지 않는다.

## 근거

- 구현은 사용 가능한 similarity component의 가중치 합으로 나누므로 audio가 없는 후보는 `hybridSimilarity=text`, 네 component가 있는 후보는 문서의 가중합이 된다. 관련 Vitest 3개 파일·11개 테스트는 현재 계약대로 통과했다.
- 40% coverage 운영 shadow의 분석된 24곡은 text 평균 0.783469, audio 0.858244, mood 0.765526, rhythm 0.827843이다. 서로 다른 모델 공간의 raw similarity 분포와 기준점이 같지 않다.
- 같은 24곡에서 네 component 결합 similarity 평균은 0.813803으로 text-only보다 0.030334 높다. catalog·freshness·editorial을 고정한 counterfactual에서 base score는 평균 0.019717 상승했고 24곡 중 23곡이 상승, 1곡이 하락했다. 범위는 -0.014815..0.033617이다.
- text-only counterfactual top 12에는 baseline rank 13..24가 0곡이지만 실제 hybrid base top 12에는 6곡이 진입했다. 같은 6곡이 Selector 이후 top 12에도 남아 있어 이번 top K 교체의 원인은 Selector가 아니라 component 결합 점수다.
- 분석 대상을 baseline rank 1..24에서 순서대로 골랐으므로 analyzed 24곡과 unavailable 36곡의 완전한 점수 구간 분리는 선택 편향도 포함한다. 이 현상만으로 가중치 오류나 추천 품질 개선을 단정하지 않는다. 같은 후보의 text-only counterfactual 차이만 availability 효과의 근거로 사용한다.
- text와 audio의 상관은 -0.116858, text와 mood는 -0.242818, text와 rhythm은 -0.100760이다. 표본이 작고 사용자 판단 label이 없으므로 평균·분산 보정, z-score, percentile rank 또는 새 가중치를 선택할 근거가 부족하다.

## 운영 영향

- production hybrid 환경 변수 세 개는 미설정이고 requested/served ranking은 계속 `baseline`, fallback은 `ranking_disabled`다.
- 이번 검토는 코드·DB·profile·운영 설정을 변경하지 않았고 provider 요청도 사용하지 않았다.
- 부분 coverage에서 hybrid serving을 허용하지 않는 계약은 100% shadow 평가와 별개로 활성화 전에 테스트·코드·문서에 반영해야 한다.

## 다음 작업

- 최신 40% coverage shadow의 baseline rank 25..36인 exact 12곡으로 세 번째 bounded cohort를 실행한다.
- 60% shadow에서도 text-only counterfactual과 hybrid base를 함께 비교해 availability uplift, top K 진입, component 분포를 기록한다.
- ranks 37..60은 세 번째 cohort 결과를 검토하기 전 분석하지 않는다.
