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

- 실행 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-gms-candidate-audio-2-20260929-135632.dump`를 만들고 PostgreSQL 컨테이너의 `pg_restore --list`로 판독했다. 크기는 181,875,321바이트, SHA-256은 `0049e8a2859ae6df1806e6c59c8dc4cd4f35d874786a2ac670b5ecb0513ad572`다.
- 실행 전 host disk 사용률은 49%, available memory는 약 3,301 MiB였고 Web·EMS·audio-analysis·PostgreSQL은 healthy였다.
- baseline rank 13..24의 정확한 UUID 12개를 `--track-id` allowlist로 지정하고 `--stage-limit 12 --batch-size 1 --max-batches 12 --request-budget 25`로 실행했다. 결과는 staged 12, claimed 12, analyzed 12, requests used 25이며 reused·retryable·failed·released는 모두 0이다.
- 실행 중 audio-analysis는 약 1.916 GiB/3 GiB, CPU 약 100.67%였고 concurrency 1을 유지했다. 완료 뒤 전체 audio job은 completed 39건이며 다른 상태는 0건이다.
- 12곡 모두 30초·16 kHz·1 channel·3 segment·coverage 1.0, `essentia-dsp-v1`, `essentia/discogs-maest-30s-pw-519l@2`, 2,304차원 L2 embedding이다. 곡별 prediction은 MAEST 10개와 MusicNN revision 1·vocabulary 2의 18개 label로 총 28개다.
- 분석 완료 뒤 인증된 GMS 자연 방문 1회로 새 shadow를 만들었다. 후보 60곡의 audio·mood·rhythm coverage는 모두 0.4, overlap@K는 0.5, 평균 절대 rank displacement는 3.3666666666666667, top K selector 변경 수는 12다. baseline rank 13..24 중 6곡이 hybrid top 12에 진입하고 기존 top 12 중 6곡이 이탈했으며 전체 candidate row 중 selector rank가 달라진 행은 35개다.
- 분석된 24곡의 hybrid score는 0.757575..0.798804, 평균 0.777645이고 hybrid rank 1..24를 차지했다. 미분석 36곡은 0.731508..0.746264, 평균 0.740151이고 rank 25..60을 차지했다. 두 점수 구간이 계속 완전히 분리돼 있으므로 실제 audio 적합도와 component availability·재정규화 영향을 아직 분리할 수 없다.
- 사용자 audio profile은 갱신하지 않았고 생성·갱신 시각도 변하지 않은 `completed`, eligible/analyzed 6/6, coverage 1.0, global centroid 1개·2,304차원을 유지한다. hybrid 환경 변수 세 개는 모두 미설정이라 requested/served는 `baseline`, fallback은 `ranking_disabled`다.
- Web·EMS·audio-analysis·PostgreSQL은 최종 healthy다. 최근 15분 관련 오류 로그는 없고 내부·공개 ready·Home·EMS·GMS·Search는 모두 HTTP 200이며, 비인증 recommendation GET과 audio-profile POST는 HTTP 401이다.

## 미검증 항목과 다음 작업

- 이 표본만으로 activation threshold, allowlist, 보관 기간 또는 자동 정리 정책을 확정하지 않는다.
- 40% coverage에서 실제 top K 교체는 관측했지만 analyzed/unavailable 점수 구간도 완전히 분리됐다. 추가 provider 요청 전에 결측 component 재정규화와 score calibration을 읽기 전용 shadow 자료와 코드로 검토하고, 그 결과로 세 번째 cohort 필요성과 경계를 별도로 결정한다.
