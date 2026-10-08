# 멜론 페이지 반복 오탐 수정 계획

## 원인과 목표

- 사용자는 멜론 오류를 수정하고 확인하도록 요청했다.
- `_next_genre_state`가 같은 장르의 이전 묶음과 첫 곡 ID 하나만 비교해 `melon_pagination_repeated`를 발생시킨다. 첫 곡만 겹쳐도 전체 작업이 실패한다.
- 운영 작업 `f1f5c63f-45b2-4770-8dfb-d6a18a1fc875`는 인디음악 `GN0500`, 다음 위치 1361에서 실패했다. 당시 전체 응답은 없으며 최근 같은 구간 조회는 서로 다른 묶음을 반환했다.

## 변경과 의존 순서

1. 첫 곡만 겹치는 서로 다른 묶음과 전체 ID가 없는 legacy 체크포인트의 실패 회귀를 먼저 실행한다.
2. 기존 JSON 체크포인트에 `lastPageSongIds`를 기록한다. 같은 장르의 이전 묶음과 현재 묶음의 모든 ID·순서가 동일할 때만 반복 오류를 발생시킨다. 기존 첫 곡 필드는 호환성을 위해 유지한다.
3. legacy 체크포인트는 전체 묶음 정보가 없으므로 첫 조회를 허용하고 이후부터 전체 비교를 적용한다. 추정한 과거 fingerprint를 만들지 않는다. 기존 JSON 필드 확장이므로 schema migration은 없다.
4. pytest와 격리 PostgreSQL에서 부분 중복 허용·정확 반복 차단·체크포인트와 후보 transaction·pause rollback·5곡 순환을 검증한다.
5. 해당 source/test/계획만 커밋해 배포 근거를 고정한다. 다른 사용자 변경과 앞선 SSD 변경은 포함하지 않는다. 운영 실행 중 EMS image를 기반으로 검증된 `melon.py`만 교체한 image를 빌드한다. source-routines는 다운로드 중이므로 재생성하지 않는다.
6. source hash·실행 image·서비스 상태와 기존 작업 snapshot을 저장소 밖에 기록한다. EMS pipeline만 교체한다. 배포 준비 중 기존 정기 루틴이 새 작업 `4de8d151-7b75-4d6d-b3bd-ec5b34c215f3`를 시작한 것을 확인했으므로 이 활성 작업을 유지한다. 실패한 과거 작업을 재개해 동시에 열린 작업 하나 제약을 위반하지 않는다. 위치·후보·누적 수는 초기화하지 않는다.
7. 새 image에서 실제 과거 failed 체크포인트와 현재 멜론 응답을 읽기 전용 재생해 1361→1366 전환을 확인한다. 운영 활성 작업의 연속 5곡 묶음·후속 장르 저장과 fingerprint 기록을 확인한다. 장애 시 기존 작업 상태를 확인하고 이전 EMS image로 복귀한다. schema down·후보 삭제·개인 데이터 변경은 하지 않는다.

## 완료 기준

- V1: 원래 코드에서 첫 곡 겹침·legacy 회귀 실패 확보, 수정 후 관련/전체 EMS pytest 통과.
- V2: 격리 DB integration에서 부분 겹침의 후보 중복 0·커서 전진, 전체 반복과 pause 시 transaction 보존, 기존 5곡/8장르 계약 통과.
- V3: 배포 image 빌드·import/compile·실행 source SHA-256 일치. 기존 image와 변경 대상 이외 EMS source hash 일치.
- V4: 기존 활성 작업 ID·누적 수와 후보를 보존한 배포, pipeline 정상 상태·restart 0, source-routines SSD mount와 container ID 보존.
- V5: 배포 image에서 실제 failed 체크포인트의 읽기 전용 1361→1366 전환, 운영 활성 작업의 연속 5곡 묶음·다른 장르 저장·전체 곡 ID 기록과 새 반복 오류 없음 확인.
- V6: 비대상 container ID 보존·Web readiness HTTP 200·새 비처리 worker/DB 오류 없음·`git diff --check` 통과 및 요청 외 diff 보존.

## 결과와 미검증

결과는 `docs/changes/2026-10-09-melon-pagination-repeat-fix.md`에 기록한다. 당시 응답의 실제 반복 여부, 모든 장르의 전체 페이지 완주는 이번 수정 검증으로 확정하지 않는다.
