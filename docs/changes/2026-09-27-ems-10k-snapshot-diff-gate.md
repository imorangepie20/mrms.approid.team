# EMS 10,000곡 확대와 snapshot diff 검토

## 실제 결과

- 결정은 `HOLD_10K`다.
- 기준 1,000곡 run은 `paused`, matched `154`, pending `806`, retryable `40`, 나머지 분류 `0`이다.
- 1k 완료 승인과 로그인 브라우저 playback 검증이 없으므로 10k staging/live와 scheduler 확대 실행은 하지 않았다.
- 외부 요청, MusicBrainz download, TIDAL GET, DB write, scheduler 상태 변경, container 재시작은 모두 `0`건이다.

## 검토에서 확인한 현재 구현

- MusicBrainz core/canonical 루틴은 이미 각각 12시간/24시간 주기의 default-enabled 상시 서비스이며 source-routines worker advisory lock과 snapshot ID unique를 사용한다.
- 현재 delta는 두 snapshot의 완전한 diff가 아니라 이전 버전 시각 이후 변경된 recording/ISRC를 전체 dump에서 찾는 additions-only scan이다. removal은 자동 비활성화하지 않는다.
- snapshot 후보 수 cap과 영속 aggregate GET counter가 없고 resolver는 `request_budget=None`이다.
- 첫 429에서 pause하지 않고 기다린 뒤 계속하며, disk 70% gate도 run을 paused로 전이하지 않는다.
- 상시 worker와 routine `enable`/`check_now`가 paused/failed run을 `pending`으로 바꿀 수 있어 운영자 pause와 승인 경계가 분리되지 않는다.
- resolver 성공과 active promotion이 같은 경로라 report-only staging과 live가 분리되지 않고 run별 선택 rollback journal도 없다.
- 관리자 계약은 상태별 독립 count, hard cap, 승인 ID, 429/disk/run별 embedding gate를 충분히 노출하지 않는다. source routine의 `melon_genres` key도 repository/UI와 route 허용 목록이 일치하지 않는다.

## 승인 수치

- 1k 종료 제안: 잔여 `846곡`, batch `24`, 최대 `36 batch`, batch GET `50`, aggregate GET `1,800`, UTC 일일 GET `1,000`.
- 10k staging: manifest 총 `10,000곡`, 기존 1k 제외 신규 최대 `9,000`, TIDAL GET·promotion `0`.
- live pilot: `240곡`, `10 batch`, GET `500`.
- 전체 확대 hard cap: 신규 `9,000곡`, `375 batch`, aggregate GET `18,000`.
- checkpoint: terminal 누적 `2,500/5,000/7,500/10,000`.
- system active 절대 cap은 기존 `500,000`을 유지하지만 이번 단계의 승인 범위는 아니다.

## 중단·품질 기준

- 첫 429, cap 도달, duplicate, 상태 합계 불일치, false match `>=1%`, health 또는 fingerprint 변화에서 pause한다.
- disk 시작 `>=60%` 금지, 실행 중 `>=65%` soft pause, `>=70%` hard stop이다.
- cohort embedding failed `>=1`, backlog `>24`, oldest `>15분`이면 pause한다.
- 최종 gate는 false match 자동 전수와 수동 `0/300`, embedding `100%`, playback `99/100`, EMS API p95 `<=300ms`, 사용자·기존 active 보존과 rollback rehearsal 통과다.

## 도입 결정

- 별도 scheduler를 추가하지 않는다. 기존 MusicBrainz 루틴을 `report-only staging`과 승인된 live 처리로 분리하는 변경을 먼저 구현·검증한다.
- 동일 snapshot 재실행 신규 candidate `0`을 연속 2회 확인한 뒤 report-only scheduler만 별도 승인한다.
- scheduler live는 10k 최종 gate 뒤 별도 승인 전까지 `0`이다.
- 상세 승인·장애·rollback 계약은 `docs/plans/2026-09-27-ems-10k-snapshot-diff-gate.md`에 기록했다.

## 검증과 미검증

- 문서 근거, migration, Python worker/source routine, TypeScript 관리자 계약을 정적 검토했다. duplicate, pause/resume, restart 뒤 cap, 429, mounted-volume disk, embedding failure와 rollback 통합 테스트가 없는 것도 차단 항목으로 기록했다.
- 운영 DB 조회, 네트워크 요청, 실제 pause/resume·429·disk·embedding fault injection은 이번 설계 단계에서 실행하지 않았다.
- secret, token, raw query, provider 응답, signed URL은 조회·출력·기록하지 않았다.
