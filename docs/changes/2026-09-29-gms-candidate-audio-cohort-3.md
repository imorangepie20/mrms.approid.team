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

- 실행 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-gms-candidate-audio-3-20260929-141635.dump`를 만들고 PostgreSQL 컨테이너의 `pg_restore --list`로 판독했다. 크기는 184,696,368바이트, SHA-256은 `860447b2ee447c0883c50f2827b9bc8dece957059bc9266036ade3077b2a0fbb`다.
- 실행 전 host disk 사용률은 49%, available memory는 약 3,272 MiB였고 Web·EMS·audio-analysis·PostgreSQL은 healthy였다.
- baseline rank 25..36의 exact UUID 12개를 `--track-id` allowlist로 지정하고 `--stage-limit 12 --batch-size 1 --max-batches 12 --request-budget 25`로 실행했다. 결과는 staged 12, claimed 12, analyzed 11, failed 1, requests used 24이며 reused·retryable·released는 모두 0이다.
- 실행 중 audio-analysis는 약 1.916 GiB/3 GiB, CPU 약 100.43%였고 concurrency 1을 유지했다. 완료 뒤 전체 audio job은 completed 50건, failed 1건이며 다른 상태는 0건이다.
- 완료된 11곡은 모두 30초·16 kHz·1 channel·3 segment·coverage 1.0, `essentia-dsp-v1`, `essentia/discogs-maest-30s-pw-519l@2`, 2,304차원 L2 embedding이다. 곡별 prediction은 MAEST 10개와 MusicNN revision 1·vocabulary 2의 18개 label로 총 28개이며 전체 308행이다.
- baseline rank 28 `Lovers In A Past Life`는 첫 시도에서 non-retryable `preview_info_rejected`로 실패했다. token·signed URL·응답 본문을 출력하지 않는 별도 2-request 진단에서 token endpoint는 HTTP 200, 해당 KR `PREVIEW` playback-info는 HTTP 403으로 재현됐다. 공통 token·service 장애가 아니라 이 트랙의 preview 접근 경계다.
- 실패 트랙에는 feature·embedding·prediction이 한 건도 저장되지 않았다. non-retryable 오류를 재시도하거나 다른 곡으로 대체하지 않았고, exact 12/12 완료 조건이 충족되지 않아 인증된 GMS 자연 방문과 새 shadow 생성도 하지 않았다. 최신 shadow는 40% coverage run 그대로다.
- 사용자 audio profile은 갱신하지 않았고 생성·갱신 시각이 변하지 않은 `completed`, eligible/analyzed 6/6, coverage 1.0, global centroid 1개를 유지한다. hybrid 환경 변수 세 개는 모두 미설정이다.
- Web·EMS·audio-analysis·PostgreSQL은 최종 healthy다. 최근 15분 관련 오류 로그는 없고 내부·공개 ready·Home·EMS·GMS·Search는 모두 HTTP 200이며, 비인증 recommendation GET과 audio-profile POST는 HTTP 401이다.

## 미검증 항목과 다음 작업

- partial coverage shadow는 activation 근거로 사용하지 않는다.
- provider가 영구 거절하는 후보가 있어 raw candidate 60곡의 100% audio coverage는 현재 정의로 달성할 수 없다. terminal-unavailable 후보를 분모·candidate set·설명 코드에서 어떻게 처리할지 정하기 전 ranks 37..60을 분석하거나 새 shadow를 만들지 않는다.
