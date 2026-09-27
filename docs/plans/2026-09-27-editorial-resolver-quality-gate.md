# 에디토리얼 resolver 품질 gate

## 목표와 승인 범위

- 대상 run은 `91280cc8-5fdd-494d-82db-6d573ea576de`이며 현재 `paused` 상태를 기준으로 한다.
- 이번 승인 범위는 남은 후보 전체가 아니라 다음 resolver batch `24곡`이다.
- catalog GET budget은 `50`, 최대 batch는 `1`, 요청 간격은 최소 `1.5초`다.
- resolver 종료 뒤 run은 다시 `paused`로 남기며 추가 batch를 자동 실행하지 않는다.
- 새 active track의 embedding은 batch size `16`, 최대 `3` batch로 제한하고 실제 미완료 `0`을 확인한다.

## 실행 전 변경

1. matched 승격 시 과거 `resolver_error_code`와 `next_attempt_at`을 지운다.
2. 첫 rate-limit 또는 request cap에서 아직 처리하지 않은 claim의 상태, lease와 시도 횟수를 복구한다.
3. embedding batch 결과의 `remaining`을 실제 DB 미완료 수로 계산한다.
4. focused test와 전체 EMS pipeline test를 통과시킨 뒤 커밋·push·배포한 image만 사용한다.

## 운영 순서

1. 디스크 `<70%`, PostgreSQL·Web·embedding health, run 분류 합계 `1,000`, `resolving=0`을 확인한다.
2. 사용자 데이터와 기존 active EMS ID의 count·digest를 비밀값 제외 기준선으로 기록한다.
3. 동시 TIDAL 호출을 막기 위해 현재 Melon job을 기존 상태 전이로 `paused` 처리하고 worker container는 재시작하지 않는다.
4. custom-format DB dump와 SHA-256을 만들고, 별도 임시 PostgreSQL container에 실제 restore한다. 복원 DB의 run·active EMS·사용자 count가 기준선과 같아야 한다.
5. target run의 기존 matched 행에 남은 과거 오류 메타데이터만 bounded one-off로 정리하고 `matched_with_error=0`을 확인한다.
6. 검증 image로 resolver `24/50/1`을 한 번 실행한다. 첫 rate-limit, budget 소진 또는 분류 불일치면 중단한다.
7. 새 active track만 포함한 미완료 embedding을 최대 `48`건 처리하고 실제 잔여 `0`을 확인한다.
8. run의 matched 전수를 ISRC, 정규화 제목·아티스트, 재생 시간 `±2초`, 숫자 TIDAL ID, 최신 KR `STREAM` 기준으로 audit한다. 확인된 false match 비율이 `1%` 미만이어야 한다.
9. 결정적 표본 `20곡`을 기존 로그인·TIDAL Device 세션으로 순차 재생한다. 앱 stream GET은 `20`, provider playbackinfo 최악 상한은 `100`이며 첫 실패나 rate-limit에서 멈춘다.
10. 사용자 데이터와 실행 전 active EMS ID가 모두 보존됐는지 확인하고 Melon job을 재개한다.

## 품질 gate와 중단 조건

- 처리 `>24`, catalog GET `>50`, batch `>1`, embedding 처리 `>48`이면 실패다.
- `rate_limited >=1`, `budget_exhausted >=1`, `resolving>0`, run이 `paused`가 아니거나 후보 합계가 `1,000`이 아니면 추가 실행을 금지한다.
- 기존 active EMS 삭제·비활성화, 사용자 데이터 count·digest 변화, PostgreSQL·embedding 비정상, 디스크 `>=70%`면 중단한다.
- false match 비율 `>=1%`, 신규 숫자 TIDAL ID 위반, embedding 미완료, rollback restore 불일치면 gate 실패다.
- playback은 20곡 모두 stream HTTP `200`, `FULL`, 현재 곡 일치, 실제 재생 위치 증가, media/HLS 오류 `0`이어야 한다. 새 로그인·Device 승인이 필요하면 인증 상태를 바꾸지 않고 `blocked_by_auth`로 남긴다.

## 롤백과 로그 제한

- 운영 DB를 즉시 덮어쓰거나 down migration을 실행하지 않는다. 이상 시 run과 Melon job을 `paused`로 유지하고 새 dump, 영향 candidate·track ID와 이전 EMS image를 기준으로 별도 복구 승인 후 처리한다.
- 상시 `ems-pipeline`·`ems-source-routines` container는 재시작하지 않는다.
- secret, token, cookie, env-file 내용, raw query, provider 원문 응답, signed stream URL을 출력하거나 저장소에 기록하지 않는다.
- 기록 대상은 release/image ID, dump 식별자·크기·checksum, 집계·비율, safe playback metadata, health와 rollback 식별자뿐이다.

## 완료 기준

- 처리 결과와 `matched/ambiguous/not_found/unavailable/retryable/budget_exhausted`, 최종 1,000곡 분류 비율을 기록한다.
- false match `<1%`, embedding 미완료 `0`, playback `20/20`, 격리 restore rehearsal을 모두 통과한다.
- 사용자 데이터와 기존 active catalog 보존을 확인하고 run을 `paused`로 남긴다.
