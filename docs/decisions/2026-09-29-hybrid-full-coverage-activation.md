# hybrid full coverage 제한 활성화 결정

## 결정

현재 인증 사용자 한 명에 한해 `hybrid-v0`를 활성화한다. serving 시점의 candidate 60곡에서 audio·mood·rhythm coverage가 모두 정확히 1일 때만 hybrid를 제공하며, 새 후보 유입 등으로 한 component라도 1 미만이 되면 `component_coverage_incomplete`를 기록하고 baseline으로 즉시 fallback한다.

운영 설정은 `GMS_RANKING_VERSION=hybrid-v0`, 현재 subject 한 명의 allowlist, `GMS_HYBRID_MIN_AUDIO_COVERAGE=1`로 제한한다. subject 값은 비밀 설정에만 저장하고 저장소와 문서에는 기록하지 않는다.

## 근거

- 기준 shadow는 `6b0f8471-0cae-4a4f-a748-e984c080a3a6`이며 candidate 60곡 모두 exact-version audio·mood·rhythm component를 갖는다. fallback 후보·null component·terminal 후보 행은 0이고 terminal 2곡은 제외 후 2곡을 backfill했다.
- text baseline과 full hybrid의 top 12 overlap은 0.5, 평균 절대 rank displacement는 10.966666666666667, 같은 artist 비율은 0이다. Selector 변경 표시는 12건이지만 hybrid base top 12와 Selector top 12 구성은 같아 추천 교체의 원인은 component 결합이다.
- component 평균은 text 0.7685971927302477, audio 0.8576064576827173, mood 0.7407122333333331, rhythm 0.8179952333333332다. text-only counterfactual 대비 hybrid base score delta는 평균 0.022935270453245636이며 59곡 상승·1곡 하락이다.
- label이나 사용자 판단 표본은 아직 없으므로 가중치 재조정 근거는 부족하다. 전체 사용자 활성화 대신 한 명 canary와 fail-closed coverage gate로 실제 판단 데이터를 수집한다.

## 보관·정리 정책

shadow는 추천 결과가 아니라 진단 관찰 데이터다. 배포 전 운영에는 사용자 1명, run 9건, 약 4시간 38분의 기록이 있으며 run table은 약 80KB, candidate table은 약 303KB다.

- 최대 보관 기간: 30일
- 사용자별 최대 보관 수: 최신 100회
- 삭제 조건: 30일 초과 또는 최신 100회 초과
- 정리 범위: `user_recommendation_shadow_runs`와 cascade되는 candidate만 해당한다. recommendation decision, 취향 profile, EMS 원본은 삭제하지 않는다.
- 실행 방식: shadow 저장 transaction의 마지막에 같은 사용자만 정리한다. `recommendation_shadow_cleanup_candidates`로 삭제 대상을 읽기 전용 확인하고 `prune_recommendation_shadow_runs`로 적용한다.

## 중단·확대 조건

- coverage 미달은 장애가 아니라 정상 fail-closed 상태로 본다.
- fallback이 반복되거나 Web·DB 오류가 발생하면 설정을 baseline으로 되돌리고 Web만 재생성한다.
- 다른 사용자 확대와 가중치 변경은 accept·reject 등 실제 label과 canary 안정성 근거가 생긴 뒤 별도 결정한다.
