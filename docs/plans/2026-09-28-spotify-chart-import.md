# Spotify 차트 EMS 수집 계획

## 목표

- Spotify `추천 차트`에 공개된 네 playlist를 관리자 실행으로 수집한다.
- Spotify 원문 메타데이터를 출처·수집 시각과 함께 staging snapshot에 보존한다.
- TIDAL KR `STREAM` 확인을 통과한 트랙만 EMS의 `Spotify 차트`에서 재생 가능하게 전시한다.
- 사용자 데이터, 기존 active EMS catalog, 기존 editorial section을 변경하지 않는다.

## 고정 대상과 예산

| 순서 | Spotify playlist | ID |
| --- | --- | --- |
| 1 | 인기 곡 - 글로벌 | `37i9dQZEVXbNG2KDcFcKOF` |
| 2 | 인기 곡 - 대한민국 | `37i9dQZEVXbJZGli0rRP3r` |
| 3 | Top 50 - 글로벌 | `37i9dQZEVXbMDoHDwVN2tF` |
| 4 | Top 50 - 대한민국 | `37i9dQZEVXbNxXF4SkHj9F` |

- Spotify 공개 embed 요청: 실행당 최대 4회
- playlist 항목: playlist당 최대 50곡, 전체 membership 최대 200건
- TIDAL catalog 요청: 실행당 최대 450회
- resolver 처리 단위: 10곡
- 동시에 열린 Spotify 차트 실행: 1개
- secret, token, cookie, signed URL, raw query는 로그·DB·응답에 기록하지 않는다.

## 변경 파일과 순서

1. `021_ems_spotify_charts.sql`과 down migration에 run, playlist, membership staging schema와 단일 open run 조건을 추가한다.
2. EMS pipeline에 Spotify embed parser와 bounded chart worker를 추가하고 기존 admin worker가 이를 처리하도록 연결한다.
3. Web admin API와 `apps/admin` 실행 화면에 시작, pause/resume, 결과 집계를 추가한다.
4. public EMS sections API에 완료된 active snapshot만 조회하는 Spotify playlist 계약을 추가한다.
5. EMS 화면에 네 playlist 카드와 선택한 playlist의 트랙 목록을 추가한다.
6. migration, parser, 상태 전이, API mapping, UI 회귀 테스트와 TypeScript/Python build를 실행한다.
7. 커밋·push 후 DB backup, migration, Web/EMS image 배포, 관리자 실행, public EMS browser QA를 수행한다.

## 중단 조건

- Spotify 응답이 HTTPS embed origin이 아니거나 JSON 계약을 벗어남
- playlist가 4개가 아니거나 playlist당 50곡 hard cap을 초과함
- Spotify 요청 4회 또는 TIDAL 요청 450회 도달
- 동일 종류 open run 존재
- TIDAL 429, DB 오류, disk health gate 실패, 명시적 pause
- 수집 결과가 0곡이거나 활성화 transaction 검증 실패

## 활성화와 rollback

- 새 run은 `active=false`인 staging 상태로 수집·resolve한다.
- 모든 처리 가능한 후보가 최종 상태가 된 completed run만 단일 transaction에서 active로 전환한다.
- 실패·pause 시 staging만 남고 기존 active snapshot과 EMS 서비스는 유지된다.
- DB rollback은 배포 전 backup과 `021_ems_spotify_charts.down.sql`을 사용한다.
- Web/EMS rollback은 배포 직전 release 경로와 container image digest를 기록해 되돌린다.

## 검증

- 네 Spotify playlist와 최대 200 membership, request cap을 DB 집계와 관리자 화면에서 대조한다.
- matched/ambiguous/not_found/unavailable/retryable/budget_exhausted 합계가 unique candidate 수와 일치하는지 확인한다.
- active snapshot이 1개 이하이고 실패 snapshot이 public EMS에 노출되지 않는지 확인한다.
- EMS desktop 및 `390x844`에서 네 카드, 선택 목록, 재생, keyboard focus, overflow를 확인한다.
- 기존 Home editorial, EMS editorial/search, 사용자 MMS/GMS와 active catalog count가 보존되는지 확인한다.
