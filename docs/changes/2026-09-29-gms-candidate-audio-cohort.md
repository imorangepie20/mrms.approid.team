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

- 실행 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-gms-candidate-audio-20260929-133431.dump`를 만들고 PostgreSQL 컨테이너의 `pg_restore --list`로 판독했다. 크기는 178,878,153바이트, SHA-256은 `b616fb6c333b54b80371627e1042ab89df28562be50a683f2cc8f494aee2e741`이다.
- 실행 전 host disk 사용률은 49%, available memory는 약 3,408 MiB였고 Web·EMS·audio-analysis·PostgreSQL은 healthy였다.
- 최신 자연 shadow의 baseline rank 1..12에 해당하는 정확한 UUID 12개를 `--track-id` allowlist로 지정하고 `--stage-limit 12 --batch-size 1 --max-batches 12 --request-budget 25`로 실행했다. 결과는 staged 12, claimed 12, analyzed 12, requests used 25이며 reused·retryable·failed·released는 모두 0이다.
- 실행 중 audio-analysis는 약 1.916 GiB/3 GiB, CPU 약 100.84%였고 concurrency 1을 유지했다. 완료 뒤 전체 audio job은 completed 27건이며 다른 상태는 0건이다.
- 12곡 모두 30초·16 kHz·1 channel·3 segment·coverage 1.0, `essentia-dsp-v1`, `essentia/discogs-maest-30s-pw-519l@2`, 2,304차원 L2 embedding이다. 각 곡의 MusicNN high-level prediction은 revision 1·vocabulary 2에서 18/18 label이다.
- 분석 완료 뒤 인증된 GMS 자연 방문 1회로 새 shadow를 만들었다. 후보 60곡 중 audio·mood·rhythm component가 있는 후보는 각각 12곡으로 coverage는 모두 0.2다. 이전 0-coverage run과 비교해 overlap@K는 1.0으로 같고, 평균 절대 rank displacement는 0.4에서 1.2로 증가했으며 top K selector 변경 수는 0에서 11로 증가했다. 전체 60개 candidate row 중 selector rank가 달라진 행은 22개다.
- 사용자 audio profile은 갱신하지 않았고 `completed`, eligible/analyzed 6/6, coverage 1.0, global centroid 1개·2,304차원을 유지한다. `GMS_RANKING_VERSION`, `GMS_HYBRID_AUTH0_SUBJECTS`, `GMS_HYBRID_MIN_AUDIO_COVERAGE`는 모두 미설정이라 requested/served는 `baseline`, fallback은 `ranking_disabled`다.
- Web·EMS·audio-analysis·PostgreSQL은 최종 healthy다. 내부 ready·Home·EMS·GMS·Search와 공개 ready·Home·EMS·GMS·Search는 모두 HTTP 200이고, 비인증 recommendation GET과 audio-profile POST는 HTTP 401이다.
- EMS 상시 worker 로그의 `1032fbc2-89f0-42e4-ac2d-b50bcfe05afc` 실패는 이번 audio cohort가 아니다. 2026-09-26에 생성된 Melon 수집 job이 cohort 실행 전인 2026-09-29 04:21 UTC에 DNS `connecterror`로 종료된 별도 기록이며, 같은 ID의 admin ingest job은 없다.

## 미검증 항목과 다음 작업

- 이 표본만으로 activation threshold, allowlist, 보관 기간 또는 자동 정리 정책을 확정하지 않는다.
- 20% component coverage에서 실제 순위 변화가 기록됐지만 serving 품질이나 activation 안전성을 확정하지 않았다. 다음 cohort 크기와 중단 기준은 이 결과를 검토한 뒤 별도로 결정한다.
