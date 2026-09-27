# 에디토리얼 resolver 품질 gate

## 이유와 범위

- 1,000곡 editorial run `91280cc8-5fdd-494d-82db-6d573ea576de`의 다음 승인 범위만 처리했다.
- resolver는 batch `24`, catalog GET `50`, 최대 batch `1`, 요청 간격 최소 `1.5초`로 제한했다.
- 남은 후보 전체로 범위를 확대하지 않았고 실행 전후 run은 `paused`로 유지했다.

## 구현과 검증

- matched 승격 시 과거 `resolver_error_code`와 `next_attempt_at`을 지운다.
- rate-limit 또는 request cap에서 아직 호출하지 않은 claim의 상태·lease·시도 횟수를 복구한다. stale `resolving`은 재처리 가능한 `retryable`로 돌린다.
- embedding batch의 `remaining`을 처리 건수가 아닌 실제 active 미완료 count로 계산한다.
- EMS pipeline 전체 pytest `58개`와 Web playback 관련 focused Vitest `32개`가 통과했다.

## 백업과 rollback rehearsal

- 실행 전 custom-format dump: `/home/approid/apps/music-pie/shared/backups/pre-step6-resolver-951fb9a.dump`.
- 크기 `175,918,287` bytes, SHA-256 `e716bda5830203bb51e7341ba98013ec457e2e5e75eeb4d718fa8620f582524d`다.
- 고정 pgvector image의 네트워크 차단 임시 PostgreSQL에 실제 restore한 뒤 live와 비교했다.
- active EMS `38,861`, run 분류 `130/830/40`, section `10`, membership `120`, 사용자 10개 테이블의 count·digest가 모두 일치했다.
- 이전 EMS rollback tag는 `music-pie-ems-pipeline:rollback-a8a84e4716c3`이고 운영 전체 DB restore는 수행하지 않았다.

## resolver 결과

| 항목 | 이번 batch | 최종 1,000곡 | 비율 |
|---|---:|---:|---:|
| matched | 24 | 154 | 15.4% |
| pending | 0 | 806 | 80.6% |
| retryable | 0 | 40 | 4.0% |
| ambiguous | 0 | 0 | 0.0% |
| not_found | 0 | 0 | 0.0% |
| unavailable | 0 | 0 | 0.0% |
| budget_exhausted | 0 | 0 | 0.0% |

- 실제 catalog GET은 `24/50`이고 처리 `24/24`, rate-limit `0`, `resolving=0`이다.
- 누적 matched count `154`와 DB 집계가 일치하고 run은 `paused`다.
- target run에 남아 있던 과거 오류 메타데이터 `19`건을 백업 뒤 `0`으로 정리했다.
- 이번 target batch가 새 active EMS `15`곡을 추가했고 9건은 기존 active track과 합쳐졌다.

## false-match와 embedding

- matched `154`건 전수를 active track, 숫자 TIDAL ID, 최신 KR `STREAM`, confidence, ISRC, metadata fallback 조건으로 감사했다.
- track 누락·비활성, ISRC 불일치, metadata 불일치, 낮은 confidence, 재생 불가, 비숫자 ID는 모두 `0`이다. 확인된 false match는 `0/154`, `0.00%`다.
- 재생 시간 차이 `2초` 초과 1건은 exact ISRC 일치라 anomaly로 분리했고 false match로 판정하지 않았다.
- one-off embedding은 총 `19`건으로 승인 상한 `48` 이하다. 전체 active 미완료 `0`, target run의 고정 model/revision·768차원·오류 없음 completed는 `154/154`다.

## playback sample 20

- 고정 표본 digest는 `9426194f7ea40900e8fc54fc81c04969`다.
- 기존 유효 TIDAL Device 세션으로 20곡을 순차 확인했다. provider playbackinfo는 `30/100`, media 요청은 `20/20`이다.
- 20곡 모두 `FULL`, playbackinfo HTTP `200`, `HIGH`, AAC `mp4a.40.2`, `audio/mp4`였고 실제 오디오 range는 HTTP `206`으로 바이트를 수신했다.
- token, cookie, provider 원문 응답과 signed stream URL은 출력하거나 저장하지 않았다.
- 자동화에서 접근 가능한 Chrome 프로필은 로그아웃 상태였고 로그인된 다른 프로필은 기존 세션이 점유 중이었다. 새 로그인·Device 승인을 하지 않았으므로 브라우저 `HTMLAudioElement` decode와 재생 위치 증가는 이번 gate에서 확인하지 못했다.

## 보존과 배포

- 백업 시점 active EMS ID `38,861/38,861`이 최종에도 모두 active였다.
- 사용자 10개 테이블의 count·digest, section과 membership fingerprint는 변하지 않았다.
- gate 중 별도 정기 TIDAL editorial run이 시작된 것을 감지해 함께 일시정지하고 안정화했다. 해당 run이 추가한 47곡과 target batch 15곡을 포함한 최종 active는 `38,923`이며 embedding 미완료는 `0`이다.
- Melon, MusicBrainz core, TIDAL editorial 작업은 검증 뒤 기존 enabled 상태로 복구했다. TIDAL editorial은 `running/discovering`, Melon과 MusicBrainz core는 재개 대기 상태다.
- release `951fb9a`, EMS image `sha256:b971716ed993bb5f6235ee3e43a61e4d51a76d30e7513ca300bc89e05cf48e22`를 배포했다.
- 상시 EMS worker `7312158fc9b...`와 source-routines `d5e6f27110e...`의 기존 image·start 시각은 바꾸지 않았다.
- local/public Home·EMS·readiness·EMS catalog smoke는 모두 HTTP `200`이다.

## 남은 항목

- 로그인 브라우저에서 표본 곡의 실제 decode, 재생 위치 증가와 media/HLS 오류 0을 별도로 확인해야 한다.
- 전체 1,000곡 run은 `pending 806`, `retryable 40`이 남아 있으므로 완료 상태가 아니다. 추가 resolver batch는 새 승인 범위와 aggregate budget을 정한 뒤 실행한다.
