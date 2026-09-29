# EMS 지역·문자권 카탈로그 제외 계획

날짜: 2026-09-29

## 이유

현재 EMS와 GMS에 사용자가 원하지 않는 인도·아랍·터키·히브리권 트랙이 포함돼 있다. 현재 트랙만 숨기면 정기 수집이나 Spotify chart 활성화가 같은 트랙을 다시 `active`로 만들 수 있으므로 수집 경계와 재활성화 경계를 함께 막는다.

## 범위

- 신규 TIDAL match를 EMS에 승격하기 전에 지역 제외 정책을 적용한다.
- ISRC 등록 국가 `IN`, `TR`, `IL`, 아랍·히브리 문자, 확인된 터키 레이블 `Moko Yapım`을 제외 신호로 사용한다.
- 기존 MusicBrainz 태그 `indian`, `desi hip-hop`, `kanada raaga`, `arabic classical`과 확인된 아랍어 트랙을 운영 삭제 대상에 포함한다.
- 삭제한 identity는 최소 TIDAL ID·ISRC·제외 사유만 `ems_catalog_exclusions`에 남겨 재유입을 막는다. 트랙 제목·아티스트·앨범·사용자 정보는 tombstone에 저장하지 않는다.
- `ems_tracks` hard delete로 원천·가용성·embedding·audio 분석 종속 행을 cascade 삭제한다.
- 저장된 GMS batch의 `recommendations`·`track_ids`와 exposure에서 삭제 트랙만 제거하고, 나머지 snapshot과 사용자 결정은 보존한다.

## 제외 판정 경계

- `IN`, `TR`, `IL` ISRC는 해당 등록 국가의 카탈로그로 판정한다.
- 제목·아티스트·앨범의 아랍 문자 또는 히브리 문자는 해당 문자권 트랙으로 판정한다.
- 독일어 `Süchtig`처럼 일부 터키 문자와 겹칠 수 있는 라틴 문자는 단독 제외 신호로 사용하지 않는다.
- 아랍권 국가 ISRC는 글로벌 배급 오탐 표본이 확인됐으므로 일괄 차단하지 않는다.
- 정책에 해당하지 않는 프랑스어·독일어·영어 트랙은 변경하지 않는다.

## 변경 파일

- `services/ems-pipeline/src/ems_pipeline/catalog_policy.py`
- `services/ems-pipeline/src/ems_pipeline/worker.py`
- 관련 EMS pytest
- `apps/web/src/lib/db/migrations/031_ems_catalog_exclusions.sql`
- 관련 migration Vitest

## 검증

1. 정책 단위 테스트로 국가 코드·문자권·레이블과 비대상 독일어·프랑스어·영어 표본을 확인한다.
2. worker가 제외 match를 `unavailable/catalog_policy_excluded_*`로 terminal 처리하고 승격하지 않는지 확인한다.
3. exact TIDAL ID·ISRC tombstone이 메타데이터와 무관하게 재승격을 막는지 확인한다.
4. migration apply/down/reapply와 EMS 전체 pytest, Web 전체 테스트·lint·build를 실행한다.
5. 운영 backup 뒤 target identity tombstone을 먼저 저장하고 batch 참조를 정리한 다음 hard delete한다.
6. 삭제 수·cascade 잔존 0·비대상 4곡 active·사용자 batch 정합성을 검증한다.

## 완료 기준

- 신규 제외 트랙이 `ems_tracks`에 승격되지 않는다.
- 기존 제외 트랙과 종속 분석 데이터가 EMS에서 삭제되고 GMS batch 참조에도 남지 않는다.
- 삭제 identity의 최소 tombstone만 남아 같은 트랙이 다시 승격되지 않는다.
- 비대상 4곡 `Je t'ai aimée`, `Süchtig`, `Heart Of A Woman`, `Ricochet`은 `active`를 유지한다.
- 원격 feature branch를 만들거나 push하지 않고, 준비 완료 뒤 로컬 `main`에서만 commit·push한다.
