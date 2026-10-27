# 멜론 페이지 반복 오탐 수정·운영 확인

## 원인과 수정

기존 `_next_genre_state`는 같은 장르의 이전 묶음과 첫 곡 하나만 비교했다. 첫 곡이 같고 나머지는 달라도 `melon_pagination_repeated`로 전체 작업이 실패했다. 당시 응답 원문은 없어 과거 실제 페이지 전체 반복 여부는 확정하지 않았다.

- 장르별 JSON 체크포인트에 `lastPageSongIds`를 저장한다. 이전 묶음과 모든 곡 ID 및 순서가 동일할 때만 반복 오류로 중단한다.
- 첫 곡만 겹치거나 곡 순서가 다른 묶음은 진행한다. 첫 곡 필드는 호환성을 위해 유지한다.
- 기존 체크포인트에는 전체 묶음 정보가 없으므로 첫 조회에서 새 정보를 기록하고 이후부터 비교한다. 첫 곡 하나로 과거 전체 페이지를 추정하지 않는다.
- schema migration, 묶음 크기 5곡, 장르 순환, 요청 간격·429, 60초 대기, 후보 중복 제거, TIDAL 매칭·권한 정책은 변경하지 않았다.

## 검증·배포

기능 커밋은 `363e2ac2562598d770a6a8e68ff6d6f33a0ce9a1`이다. 소스·두 테스트 파일·계획의 4파일만 커밋했으며 앞선 SSD 변경과 사용자 변경은 포함하지 않았다. 원격 push는 수행하지 않았다.

- 원래 코드에서 신규 회귀 `test_same_first_song_with_different_remaining_songs_advances`, `test_legacy_checkpoint_bootstraps_full_page_before_rejecting_repeat`가 모두 `melon_pagination_repeated`로 실패했다.
- 수정 후 EMS 전체 pytest 119개, 멜론·스케줄링 관련 23개, compileall을 통과했다.
- 격리 PostgreSQL integration 7개 assertion 묶음을 통과했다. 처음 추가한 fixture는 기존 fixture를 종료하지 않아 단일 열린 멜론 작업 제약으로 실패했다. 이전 fixture를 종료하도록 테스트를 수정하고 비어 있는 전용 DB에서 integration 전체와 pytest 전체를 재실행했다. 제품 제약은 변경하지 않았다. 전용 test container와 volume은 검증 후 제거했다.
- 실제 부분 겹침의 10개 조회 항목은 중복 후보 없이 9개로 저장되고 커서 11로 진행했다. 이후 정확한 전체 반복은 차단됐고 작업·후보가 변경되지 않았다. 기존 pause rollback, 8장르·40후보, 60초 대기와 linked-source 갱신도 통과했다.
- 커밋 archive SHA-256은 `c1b72a0a8d15e79f07e777c314d7991c4a3903c73ac82b4ce9ae7df1bcc38234`다.
- 운영 실행 중 EMS image `sha256:ebb9bce815624e17232feef9673880ed5de93cbd62bd2a6f616072c77120816e`를 기반으로 `melon.py`만 교체한 image `music-pie-ems-pipeline:melon-pagination-363e2ac`를 빌드했다. 설치된 Python source 비교에서 변경 파일은 `melon.py` 하나뿐이다.
- 새 image ID는 `sha256:400ceb6cab7cbffa4ec638e050e15a78112ab8b60a8b753e8761fdd31aeb7122`, 실행 source SHA-256은 `0d04a0924a3ed0cc2377343d01482a887f09741f3a7ec7f6ab818c84920de43a`다.
- 운영에는 `/home/approid/apps/music-pie/shared/compose.melon-pagination.yml`의 EMS image override를 적용했다. current release source와 symlink를 수정하지 않았다. source-routines는 진행 중인 MusicBrainz 작업을 보존해 재생성하지 않았다.

## 실제 운영 확인 — 2026-10-09 08:33 KST

작업 준비 중 정기 루틴이 이미 새 활성 작업 `4de8d151-7b75-4d6d-b3bd-ec5b34c215f3`를 시작했다. 이를 유지하고 과거 failed 작업을 강제 재개하지 않았다. DB의 작업·후보·위치·누적 수를 초기화하지 않았다.

- 활성 작업 발견 수는 배포 전 15→30, 후보 28, 상태 `running / batch_wait`, 오류 null이다. 배포 전 후보 ID가 모두 남아 있다.
- 수정 후 인디음악 `GN0500`과 록/메탈 `GN0600`의 연속 5곡 묶음이 저장되고 각 `nextStartIndex=6`, `lastPageSongIds` 5개를 확인했다. 60초 대기 이후 다음 장르로 순환한다.
- 과거 실패 작업 `f1f5c63f-45b2-4770-8dfb-d6a18a1fc875`의 실제 체크포인트와 현재 멜론 응답을 새 image에서 읽기 전용 재생해 인디음악 1361→1366 전환을 확인했다. 해당 역사적 실패 행은 그대로다. 이는 운영의 과거 작업을 재개한 것과 구분한다.

## 완료 기준 결과

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| V1 회귀 | PASS | 수정 전 두 회귀 실패, 수정 후 `python -m pytest -q` 119 passed·관련 23 passed·compileall 종료 0 |
| V2 실제 DB | PASS | 전용 PostgreSQL `python tests/integration_melon.py` 7개 assertion 묶음 통과·종료 0, 부분 겹침 후보 9개·반복 rollback 확인 |
| V3 image | PASS | image build·import/compile, 변경 source `melon.py` 1개와 배포 source hash 일치 |
| V4 상태 보존 | PASS | 기존 활성 작업 ID·누적 수·기존 후보 ID 보존, pipeline healthy·restart 0, source-routines ID·SSD mount 유지 |
| V5 운영 진전 | PASS | 실제 과거 위치 읽기 전용 1361→1366, 활성 발견 15→30·인디/록 2묶음·전체 ID 저장·새 오류 null |
| V6 범위·건강 | PASS | 비대상 container ID 67개 동일, Web readiness 200, 새 worker/DB 오류 각각 0, `git diff --check` 종료 0 |

운영 증거는 `/home/approid/apps/music-pie/shared/artifacts/20261009-melon-pagination`의 `pipeline-before.json`, `image-verification.json`, `live-replay-verification.json`, `final-verification.json`, `verify-final.py`다. 운영 V3–V6 검증 명령은 `ssh -o BatchMode=yes -o ConnectTimeout=8 approid@192.168.219.174 'python3 /home/approid/apps/music-pie/shared/artifacts/20261009-melon-pagination/verify-final.py'`이며 종료 0을 확인했다. V1–V6 필수 미검증은 없다.

Hindsight 등록·문서 반영 이후 운영 V3–V6 전체를 다시 실행해 종료 0을 확인했다. 최종 관찰에서 같은 활성 작업은 발견 55·후보 53·`running / resolving`으로 이어졌고 전체 곡 ID가 7장르에 저장됐다. 이후 체크포인트와 수치는 정상 수집에 따라 계속 바뀐다. 원고에 저장한 15→30 수치는 08:33 KST 검증 시점의 사실이며 최종 관찰과 구분한다.

## 미검증·복구·다음 작업

- 당시 실패 응답 원문이 없어 실제 전체 페이지 반복 여부는 미검증이다. 모든 장르의 모든 페이지 완주는 수집 중이므로 확인하지 않았다.
- 장애 시 이전 image `music-pie-ems-pipeline:melon-base-20261009`로 EMS만 복귀하고 작업·체크포인트를 보존한다. 이전 image의 첫 곡 비교 문제가 재발할 수 있으므로 상태를 먼저 확인한다.
- 향후 정상 release 배포에는 커밋의 변경을 포함하고 임시 image override를 제거하거나 갱신한다. SSD storage override와 source-routines image를 보존한다.
- 사용자 후속 요청에 따라 완료 결과를 Hindsight의 기존 `music-pie` 뱅크에 별도 날짜 문서로 등록하고 원문/hash·검색 memory 10개·기존 등록과 다른 뱅크 보존을 검증했다. [Hindsight 등록 결과](2026-10-09-ems-recovery-hindsight.md) 참조.
