# 에디토리얼 우선 resolver bounded 실행

## 이유와 범위

- 1,000곡 TIDAL editorial snapshot의 기존 canary 이후, active editorial section과 조인 가능한 미처리 후보를 먼저 확인할 필요가 있었다.
- 대상 run `91280cc8-5fdd-494d-82db-6d573ea576de`에 batch size `24`, catalog GET budget `50`, 최대 batch `1`, 요청 간격 최소 `1.5초`를 적용했다.
- 실행 전후 target run은 `paused`로 유지하고, 기존 active EMS와 사용자 데이터는 삭제하거나 비활성화하지 않았다.

## 구현

- candidate claim 순서를 active editorial section 조인 여부, pending 여부, `sequence_no` 순으로 확장했다.
- CLI에 `--prioritize-editorial`과 `--min-request-interval-seconds`를 추가했다.
- run의 `matched_count`를 이번 호출 건수가 아니라 DB의 누적 matched 후보 수로 갱신한다.
- 결과 JSON에 실제 catalog GET 사용량 `requests_used`를 포함한다.

## 운영 실행

- 실행 이미지: `music-pie-ems-pipeline:resolver-38c22ae0f47e`.
- 운영 Web release symlink와 장기 실행 EMS image는 전환하지 않았다.
- 실행 전 DB 백업: `/home/approid/apps/music-pie/shared/backups/pre-editorial-resolver-38c22ae0f47e.dump`.
- 백업 크기 `174,711,060` bytes, SHA-256 `0c36980f6657f59727e169b304ba008e1a66d8b4505899756be0379e3b5ed607`; PostgreSQL container의 `pg_restore -l`로 읽기를 확인했다.
- 동시 TIDAL 호출을 피하려고 실행 중이던 Melon 작업을 API와 같은 상태 전이로 잠시 `paused` 처리했다. batch 종료와 DB 검증 뒤 기존 작업을 재개했고 `running/discovering`, fresh heartbeat를 확인했다.
- 디스크 사용률은 `61%`, PostgreSQL·Web·embedding container는 모두 healthy였다. secret directory/file 권한은 기존 `700/600`을 유지했다.

## 결과

| 항목 | 결과 |
|---|---:|
| 처리 | 24 |
| matched | 24 |
| ambiguous | 0 |
| not_found | 0 |
| unavailable | 0 |
| retryable | 0 |
| budget_exhausted | 0 |
| catalog GET | 24 / 50 |

- 우선 처리 24건은 editorial 조인 `13`건과 일반 pending `11`건으로 계획과 일치했다.
- DB 누적 상태는 matched `106→130`, pending `851→830`, retryable `43→40`, resolving `0`이다. 합계는 `1,000`이며 run `matched_count=130`과 일치한다.
- 엄격한 pending 잔여는 `830`, 현재 처리 가능한 unresolved 잔여는 `870`이다.
- active EMS는 `38,582→38,618`로 증가했고 total과 active가 모두 `38,618`이다. 기존 active EMS 삭제·비활성화는 없었다.
- 사용자 `1`, TIDAL 연결 `1`, 플레이리스트 `3`, 저장 트랙 `101`, 플레이리스트 수록곡 `101`, 가져오기 `3`, 좋아요 `0`, 취향 프로필 `1`, 중심 `3`은 변하지 않았다.
- run은 `paused`로 끝났고 추가 batch는 실행하지 않았다.

## 보안과 롤백

- env-file 내용, token, cookie, raw TIDAL query, provider 원문 응답을 출력하거나 저장소에 기록하지 않았다.
- 이상이 확인되면 target run을 `paused`로 유지하고 위 custom-format 백업과 영향 candidate/track 식별자를 기준으로 별도 복구 승인을 받는다. 전체 DB 즉시 restore는 수행하지 않는다.
- 이전 Web release `bc47ed34e971`, 장기 실행 EMS image와 사용자 데이터는 그대로 보존했다.

## 남은 항목

- 이전 `rate_limited` 상태에서 이번에 matched가 된 3건은 `resolver_status=matched`와 시도 횟수는 정확하지만 과거 `resolver_error_code`가 남아 있다. 결과 집계에는 영향이 없으며, 다음 batch 전 matched 승격 시 오류 메타데이터를 지우는 회귀 테스트와 수정을 별도 적용한다.
- 다음 resolver batch와 새 EMS 임베딩 처리는 다시 승인받기 전 실행하지 않는다.
