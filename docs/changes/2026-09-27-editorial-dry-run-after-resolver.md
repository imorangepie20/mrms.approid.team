# Resolver 확장 후 editorial section dry-run

## 목적과 범위

- 24곡 resolver batch 뒤 `sync-editorial-sections --dry-run`을 다시 실행해 5개 section의 조인 가능 수를 확인했다.
- dry-run의 `stored`는 계약상 항상 0이므로 `joined`를 projected stored로 판정했다.
- 실제 membership write, image `current` tag 변경, release symlink 전환과 Web 재시작은 수행하지 않았다.

## 실행 조건

- 검증 이미지: `music-pie-ems-pipeline:resolver-38c22ae0f47e`.
- 명시적 제한: `--dry-run --playlist-limit 2 --request-budget 24 --request-timeout 8`.
- 동시 TIDAL 호출을 피하려고 Melon 작업을 잠시 `paused` 처리하고 dry-run 뒤 재개했다.
- focused pipeline 테스트는 `12 passed`, Web editorial 계약 focused Vitest는 `24 passed`였다.

## 결과

| slug | discovered | joined/projected stored | stored | gate |
|---|---:|---:|---:|---|
| `new-releases` | 39 | 25 | 0 | 통과 |
| `seasonal-jazz` | 38 | 38 | 0 | 통과 |
| `night-rnb` | 39 | 28 | 0 | 통과 |
| `feel-good` | 34 | 30 | 0 | 통과 |
| `focus` | 26 | 26 | 0 | 통과 |

- `joined >= 6`인 section은 `5/5`이므로 최소 `4`개 기준을 통과했다.
- 모든 slug의 `discovered`가 0보다 커서 뒤쪽 slug가 명백히 누락된 결과는 아니었다.
- CLI는 editorial discovery의 실제 request 사용량이나 budget exhaustion 여부를 출력하지 않는다. 이번 판정은 승인된 request budget 안에서 반환된 5개 slug 집계에 한정한다.

## DB·서비스 불변 검증

- 운영 section 테이블은 2026-09-23 실제 sync로 이미 채워져 있다. 실행 전 기준은 section `10`, membership `113`이며 active section membership `53`, inactive `temporary-*` membership `60`이다.
- 실행 전후 section fingerprint `d86ad06e994c8524fdd0714314b5d30d`, membership fingerprint `1a54b9796282db75f644368080c636c8`가 각각 동일했다.
- membership 중복과 inactive EMS track 참조는 각각 `0`이다.
- resolver run은 `paused`, matched `130`, pending `830`, retryable `40`, 전체 후보 `1,000`으로 유지됐다.
- release symlink는 `/home/approid/apps/music-pie/releases/bc47ed34e971`로 유지됐다. PostgreSQL·Web·embedding container는 healthy이며 Home·EMS·readiness는 HTTP 200이다.
- Melon 작업은 재개했고 최종 확인에서 `running/discovering`, fresh heartbeat였다.

## Acceptance 해석과 다음 승인점

- 현재 운영에는 기존 section/membership이 있으므로 실패 시 테이블을 비우는 것은 안전 조건이 아니라 서비스 데이터 삭제다.
- 이번 단계의 올바른 실패 불변 조건은 기존 section·membership과 현재 release·서비스가 전후 동일한 것이다. 해당 조건을 충족했다.
- gate는 통과했지만 실제 membership sync와 release 전환은 별도 사용자 승인 전 수행하지 않는다.
