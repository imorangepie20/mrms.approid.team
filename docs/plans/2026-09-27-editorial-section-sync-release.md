# Editorial section sync와 release 전환

## 승인 범위

- Step 3 dry-run gate가 통과한 경우에만 실제 section membership을 갱신한다.
- section sort order 전역에서 track을 중복 제거하고 각 section은 최대 12곡으로 제한한다.
- 실제 write 직전 고정 projection에서 최소 4개 section이 각각 6곡 이상이어야 한다.
- 실제 sync, 검증한 Web/EMS image 태깅, release symlink 전환, Web만 재생성한다.
- 실행 중인 `ems-pipeline`과 `ems-source-routines` container는 시작·재생성·재시작하지 않는다.

## 실행 순서

1. Pipeline 전체 테스트, Web test/lint/build, Compose config와 diff를 검증한다.
2. 현재 release·Web/EMS image ID와 section·membership·screen·사용자 기준선을 기록한다.
3. custom-format DB 백업을 만들고 `pg_restore -l`로 검증한다.
4. immutable release SHA로 Web/EMS image를 빌드하고 기존 image에 rollback tag를 부여한다.
5. 새 EMS image로 bounded dry-run을 재확인한다.
6. 같은 image로 actual sync를 한 번 실행한다.
7. section별 membership `6..12`, 전역 duplicate `0`, inactive/orphan 참조 `0`, screen·사용자 기준선 불변을 확인한다.
8. 검증한 image를 `current`로 태깅하고 release symlink를 원자 전환한다.
9. Web만 `--no-deps --no-build --force-recreate`로 교체하고 local/public health·sections API·Home·EMS를 확인한다.

## 중단 조건

- 새 image dry-run에서 `joined >= 6`인 section이 4개 미만이거나 5개 slug가 완전하지 않다.
- actual sync 결과가 section당 `6..12`를 벗어나거나 duplicate/inactive/orphan membership이 생긴다.
- 기존 inactive `temporary-*` membership, screen 설정, resolver 상태 또는 사용자 데이터가 변한다.
- Web/EMS build, health, sections API, Home, EMS smoke가 실패한다.
- secret, token, raw provider query/response가 출력된다.

## 롤백

- 실행 전 DB dump, 이전 release symlink, 실행 중 container image ID, Web/EMS rollback tag를 보존한다.
- sync 검증 전 오류는 release를 전환하지 않는다. transaction 오류는 section write 전체 rollback을 확인한다.
- Web smoke 실패 시 이전 symlink와 image tag를 복원하고 Web만 재생성한다.
- commit된 section 데이터의 복구는 영향 범위 검토 없이 전체 DB를 즉시 덮어쓰지 않는다. 백업과 이전 membership fingerprint를 기준으로 별도 복구한다.

## 완료 기준

- 최소 4개 section이 DB와 local/public API에서 각각 6~12곡이다.
- `(section_id, track_id)` 중복은 0건이다.
- health, sections API, Home, EMS smoke가 모두 성공한다.
- release SHA, image ID, rollback tag, DB backup 식별자를 변경 기록에 남긴다.
