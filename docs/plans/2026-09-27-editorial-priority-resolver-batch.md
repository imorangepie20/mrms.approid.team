# 에디토리얼 우선 resolver bounded 실행

## 목표와 승인 범위

- 대상 run: `91280cc8-5fdd-494d-82db-6d573ea576de`.
- active editorial section과 ISRC 또는 정규화한 제목·아티스트가 조인 가능한 처리 대기 후보를 먼저 선택한다.
- batch size `24`, catalog GET request budget `50`, 최대 batch `1`, 요청 간격 최소 `1.5초`로 제한한다.
- 실행 뒤 run은 결과와 관계없이 `paused`로 남기며 추가 batch를 자동 실행하지 않는다.

## 실행 전 기준선

- 처리 가능 잔여 `894`: strict pending `851`, due retryable `43`, stale resolving `0`.
- active editorial section 조인 후보 `13`: pending `10`, retryable `3`.
- 후보 선택 순서는 editorial 조인 여부, pending 여부, `sequence_no` 순이다.
- CLI request budget은 catalog GET 상한이다. 인증 token 요청은 포함하지 않으며, 결과에 실제 catalog GET 사용량을 기록한다.

## 변경과 검증 순서

1. editorial 우선 claim, 누적 `matched_count`, CLI 옵션을 실패 테스트로 고정한다.
2. focused 및 전체 EMS pipeline 테스트를 실행한다.
3. 운영 디스크 `<70%`, PostgreSQL·embedding readiness, stale lease와 최근 rate limit을 읽기 전용으로 확인한다.
4. 권한 `700/600`인 기존 secret 파일은 내용 출력 없이 `--env-file`로만 사용한다.
5. 운영 DB custom-format 백업을 생성하고 `pg_restore -l`로 읽기 가능성을 확인한다.
6. 검증한 one-off image로 bounded resolver를 한 번 실행한다.
7. CLI 집계와 DB 전후 delta, run `paused`, `resolving=0`, pending 잔여, active EMS·사용자 데이터 보존을 확인한다.

## 중단 조건

- 실제 디스크 사용률 `>=70%`, PostgreSQL 또는 embedding 비정상.
- 선택 예정 첫 24건이 승인 우선순위와 불일치.
- 실행 직전 최근 rate-limit이 남아 있거나 실행 결과 `rate_limited >= 1`.
- `budget_exhausted >= 1`, `requests_used > 50`, 처리 후보 `>24`, batch `>1`.
- 실행 후 `resolving > 0`, run이 `paused`가 아님, CLI와 DB 상태 delta·잔여 수 불일치.
- active EMS 삭제·비활성화, 사용자 데이터 count 변화, 비밀값·token·raw query 노출.

## 롤백

- 실행 전 custom-format DB 백업과 기존 EMS image를 보존한다.
- resolver transaction 실패 시 DB write가 commit되지 않은 것을 확인하고 추가 실행하지 않는다.
- commit 뒤 데이터 이상이 확인되면 서비스를 추가 변경하지 않고 run을 `paused`로 유지한 채 백업과 영향 candidate/track 목록을 기준으로 별도 복구 승인을 받는다. 운영 전체 DB를 즉시 덮어쓰지 않는다.

## 로그 제한

- `set -x`, `env`, env-file 내용, OAuth token, cookie, signed URL, raw TIDAL query와 provider 원문 응답을 출력하지 않는다.
- run ID, image ID, 상태별 count, request 사용량, health와 백업 파일명·크기만 기록한다.

## 실행 결과

- 승인된 단일 batch만 실행했다: 처리 `24`, matched `24`, ambiguous/not_found/unavailable/retryable/budget_exhausted 각 `0`.
- catalog GET은 `24/50`이었고 batch size `24`, 최대 batch `1`, 최소 간격 `1.5초`를 넘지 않았다.
- DB 누적 상태는 matched `130`, pending `830`, retryable `40`, resolving `0`, 전체 `1,000`이며 run `matched_count=130`과 일치한다.
- run은 `paused`로 남겼다. 상세 운영 기록은 `docs/changes/2026-09-27-editorial-priority-resolver-batch.md`에 있다.
