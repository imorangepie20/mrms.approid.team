# EMS 10,000곡 확대와 snapshot diff gate

## 결정과 범위

- 결정은 `HOLD_10K`다. 1,000곡 run `91280cc8-5fdd-494d-82db-6d573ea576de`가 `paused`이고 `matched 154`, `pending 806`, `retryable 40`이라 완료·승인 조건을 충족하지 않는다.
- 이번 단계에서는 10,000곡 staging/live, TIDAL 요청, MusicBrainz 다운로드, scheduler 상태 변경, DB write를 실행하지 않는다.
- 여기서 10,000곡은 전체 active EMS 수가 아니라 하나의 승인된 MusicBrainz cohort에 속한 고유 후보 수다. 시스템 전체 active 절대 상한 `500,000`은 유지하지만 이번 승인 범위에는 포함하지 않는다.
- 기존 `musicbrainz_core` 12시간, `musicbrainz_canonical` 24시간 루틴은 default-enabled 상시 서비스로 이미 배포돼 있다. 대체 scheduler를 새로 만들지 않고 기존 additions-only delta 경로를 default-disabled report-only staging과 승인된 live 처리로 분리해 보강한다.

## 현재 근거

- 1,000곡 분류 합계는 `1,000`이지만 terminal은 `154`뿐이고 미처리·재시도 대상이 `846`이다.
- matched 전수 자동 감사는 false match `0/154`, target embedding은 `154/154`, 실제 media range는 `20/20`이다.
- 로그인 브라우저 `HTMLAudioElement`의 decode와 재생 위치 증가는 확인하지 못했다.
- 기존 구현은 snapshot ID unique index와 source-routines advisory lock을 갖지만 후보 수 cap, 영속 aggregate GET counter, 승인 상태, staging/live 분리가 없다.
- snapshot resolver는 `request_budget=None`이고 첫 429 뒤 대기 후 계속하며, disk gate는 70%에서 pause 상태로 전이하지 않고 기다린다.
- 상시 worker와 관리자 `enable`/`check_now`는 paused run을 `pending`으로 바꿀 수 있어 운영자 pause와 승인 경계가 분리되지 않는다.

## 승인 체크포인트

| 체크포인트 | 승인 범위 | 수치 hard cap | 통과 조건 |
|---|---|---|---|
| CP-1 | 현재 1k 종료 | 잔여 후보 `846`, batch `24`, 최대 `36 batch`, batch GET `50`, aggregate GET `1,800`, UTC 일일 GET `1,000` | terminal 합계 `1,000`, `pending/resolving/retryable/budget_exhausted=0`, run `completed` |
| CP-2 | 10k report-only staging | manifest 총 `10,000`, 기존 1k 제외 신규 최대 `9,000`, TIDAL GET `0`, promotion `0` | checksum·row count·고유 candidate 검증, 동일 snapshot 재적재 신규 `0` |
| CP-3 | live pilot | 신규 `240`, batch `24` x `10`, aggregate GET `500` | false match `<1%`, cohort embedding `100%`, browser playback `20/20` |
| CP-4 | 잔여 live | 신규 최대 `8,760`, batch 최대 `365`, aggregate GET 최대 `17,500` | terminal 누적 `2,500/5,000/7,500/10,000`마다 별도 승인 |
| CP-5 | 10k 최종 gate | 신규 합계 `9,000`, batch `375`, aggregate GET `18,000` | 아래 품질·성능·보존·rollback 조건 모두 통과 |
| CP-6 | scheduler report-only | 새 verified snapshot당 staging `10,000`, live `0` | 동일 snapshot 재실행 신규 candidate `0`을 연속 2회 확인 |
| CP-7 | scheduler live | 별도 승인 전 `0` | 10k 최종 gate 통과 후 새 승인 문서가 있어야 함 |

CP-1부터 CP-7까지는 서로의 승인을 대신하지 않는다. `request_budget`과 `requests_used`는 같은 run에서 pause/resume 후에도 초기화하지 않고 단조 증가해야 한다. 401 refresh를 포함한 모든 catalog GET은 요청 전에 DB의 aggregate cap과 UTC 일일 cap을 원자적으로 확인한다.

## 10k 진입 조건

1. CP-1을 별도 승인받아 1k run을 완료한다.
2. matched 전수 자동 감사와 결정적 수동 표본 최소 `200곡`에서 false match가 `<1%`다. matched가 200곡 미만이면 전수를 검토한다.
3. 해당 run matched embedding 완료율 `100%`, 768차원, norm `0.999..1.001`, 전체 active embedding 미완료 `0`이다.
4. 로그인 브라우저 고정 표본 `20/20`에서 decode, 재생 위치 증가, media 오류 `0`을 확인한다.
5. 격리 restore rehearsal, 기존 active ID, 사용자 10개 테이블 count·digest, section fingerprint 보존을 확인한다.
6. 승인 ID·승인자·승인 시각, snapshot ID, selector version, manifest SHA-256와 hard cap을 run에 고정한다.

## 10k 최종 품질 gate

- matched 전수 자동 감사와 결정적 층화 표본 `300곡` 수동 검토에서 false match `0/300`이어야 하며 누적 false-match 비율은 `<1%`여야 한다.
- active TIDAL ID와 `(run_id, candidate_key)` 중복은 각각 `0`이고 상태별 독립 count 합계가 candidate count와 같아야 한다.
- 신규 matched embedding은 `100%` completed이고 failed `0`, 768차원과 norm 범위를 만족한다.
- 결정적 playback 표본 `100곡` 중 최소 `99곡`이 실제 decode·재생 위치 증가를 통과한다.
- EMS catalog API p95는 `300ms` 이하다.
- 기존 active ID와 사용자 데이터 fingerprint가 보존되고, run별 before-image journal을 이용한 격리 rollback rehearsal이 통과한다.

## 자동 중단 조건

- 첫 `429`, request/candidate/batch/day hard cap 도달, checksum·manifest 불일치, duplicate `>0`, 상태 합계 불일치에서 신규 claim을 중단하고 run을 `paused`로 둔다.
- false match가 `>=1%`이거나 기존 active 비활성화·사용자 fingerprint 변화가 1건이라도 확인되면 hard stop한다.
- 시작 시 disk 사용률이 `>=60%`면 snapshot download/staging을 시작하지 않는다. 실행 중 `>=65%`면 soft pause, `>=70%`면 hard stop한다. core `25GiB`, canonical `12GiB` reserve도 각각 충족해야 한다.
- PostgreSQL, Web, embedding health가 비정상이거나 run cohort embedding failed가 1건 이상, backlog가 `24` 초과, oldest가 `15분` 초과면 pause한다.
- batch 종료 후 expired lease를 제외한 `resolving`이 남거나 다음 checkpoint 전에 cohort embedding 미완료가 있으면 진행하지 않는다.

## 장애 시나리오와 필요한 구현

### 중복 run

- 기존 snapshot ID unique에 더해 `(run_type, source_key, snapshot_id, selector_version, manifest_sha256)` idempotency key와 open MusicBrainz run 1개 partial unique를 둔다.
- 같은 snapshot run이 어떤 상태로든 있으면 새 run을 만들지 않는다. 다른 snapshot의 open run이 있으면 `deferred`만 기록한다.

### Pause·resume

- `pause_reason`, `paused_by`, `resume_after`, `approval_id`, `candidate_cap`, `requests_used`를 영속화한다.
- `operator`, `quality_gate`, `request_cap`, `rate_limited` pause는 명시적 승인 API만 같은 run을 resume할 수 있다. routine `enable`/`check_now`는 run 상태를 바꾸지 않는다.
- pause 전에 미호출 claim을 이전 상태로 복구하고 lease와 attempt를 되돌린다. expired lease만 회수하며 checkpoint와 요청 누계는 보존한다.

### 429

- 첫 429에서 `Retry-After`와 안전한 오류 코드만 기록하고 새 claim을 중단한다. 대기 시각이 지나도 자동 resume하지 않는다.
- 병렬 worker, token 교체, 반복 재시도로 provider 제한을 우회하지 않는다.

### Disk

- 검증된 최신 core/canonical snapshot 두 세트만 저장소 밖에 보존한다. 삭제는 사용 중이 아닌 구버전임을 확인한 별도 정리 작업으로만 수행한다.
- disk gate는 무한 wait 대신 paused 상태와 임계값·관측값을 관리자 API에 노출한다.

### Embedding

- run cohort별 completed/pending/failed, oldest age와 연속 실패 횟수를 기록한다. 기존 전체 active backlog와 구분한다.
- incomplete 신규 track은 공개하지 않고, 기존 active와 Web은 유지한다. 다음 resolver batch는 cohort backlog가 0일 때만 시작한다.

### Rollback

- resolver 성공 즉시 기존 track을 덮어쓰는 경로와 live promotion을 분리하고, run별 신규 track ID와 기존 row before-image를 journal에 남긴다.
- rollback은 승인된 cohort의 신규 promotion만 비활성화하고 기존 track의 변경 필드만 before-image로 복원한다. 운영 전체 DB restore, down migration, hard delete는 자동으로 수행하지 않는다.

### 회귀 검증

- duplicate schedule, operator pause 보존, restart 뒤 aggregate cap, 첫 429 pause, 실제 mounted volume disk gate, run-scoped embedding failure와 선택 rollback을 통합 테스트한다.
- source routine key는 DB, repository, route와 UI가 하나의 계약을 사용해야 한다. 현재 route에서 누락된 `melon_genres`를 포함한 parity test를 둔다.
- CLI와 관리자 집계가 terminal·pending·retryable을 겹치지 않게 산출하고 각 상태 합계가 candidate count와 같음을 검증한다.

## 관측 계약

- API/UI는 `candidateHardCap`, `requestBudget`, `requestUsed`, `remainingBudget`, `approvalId`, snapshot·manifest·selector provenance를 표시한다.
- matched, ambiguous, not_found, unavailable, retryable, budget_exhausted, pending, resolving은 겹치지 않는 독립 count로 제공하고 합계 invariant를 표시한다.
- blocked reason, `Retry-After`, disk 사용률과 임계값, run cohort embedding backlog·failed·oldest age를 제공한다.
- secret, token, cookie, env-file 내용, raw query, provider 원문 응답, signed stream URL과 embedding input 원문은 로그·문서·저장소에 남기지 않는다.

## 현재 결론

- CP-1 사용자 승인이 없으므로 CP-2 이후는 모두 `HOLD`다.
- 현재 구현은 위 승인·예산·관측 계약을 강제하지 못하므로 문서 승인만으로 10k live나 scheduler live를 실행할 수 없다.
- 이번 검토의 외부 요청, DB write, scheduler 변경, container 재시작은 모두 `0`건이다.
