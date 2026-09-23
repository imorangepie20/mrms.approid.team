# EMS 원천 정기 갱신 계획

## 목표와 근거

- 관리자 메뉴에 `정기 수집`을 추가해 원천별 주기, 최근 확인, 적용 버전, 다음 확인, 오류를 확인한다.
- TIDAL 공개 에디토리얼은 기존 무제한 수집 작업이 끝난 뒤 정기 재탐색한다. 중복 TIDAL ID·ISRC는 다시 승격하지 않는다.
- MusicBrainz core의 `LATEST`와 canonical 배포 목록을 주기적으로 확인한다. 새 버전만 검증해 처리하고 core 녹음·ISRC와 canonical 대표성 정보를 결합해 신규 후보를 만든다.
- 사용자 플레이리스트 가져오기는 기존 이벤트 기반 경로를 유지한다. 개인 데이터는 공용 원천 갱신에 넣지 않는다.
- MusicBrainz 공식 문서 기준 core 전체 덤프는 주 2회, canonical 데이터는 매월 1·15일 갱신된다. 작은 버전 확인 요청은 각각 12시간·24시간 간격으로 한다.

## 설계

1. PostgreSQL에 원천별 루틴 상태를 저장한다. `enabled`, `next_check_at`, `last_checked_at`, `last_version`, `last_success_at`, `last_added_count`, `error_code`를 둔다. 소스 작업은 단일 워커 잠금과 버전 키로 중복 실행을 막는다.
2. 상시 EMS 워커가 TIDAL 루틴을 하루 간격으로 예약한다. 기존 수동 작업이 열려 있으면 기다린다. 수동 일시정지는 자동 재개하지 않는다.
3. MusicBrainz 갱신기는 서버의 저장소 밖 작업 디렉터리에서 새 core/canonical 아카이브를 검증한다. 공간 게이트를 통과할 때만 다운로드한다. core 새 녹음·새 ISRC를 추출하고 canonical 정보로 순위를 보강한다. 결과는 기존 manifest 계약으로 staging한다.
4. MusicBrainz 후보는 기존 TIDAL resolver와 embedding 경로를 통과한다. 정확 매칭·KR STREAM 확인 전에는 EMS 활성곡에 넣지 않는다. 원천 버전과 MBID를 provenance에 기록한다.
5. 관리자 `정기 수집` 화면에서 소스 상태와 최근 실행을 표시하고 활성화·일시정지·지금 확인을 조작한다. 기존 `EMS 수집` 화면은 실행 중인 작업 그래프를 유지한다.

## 변경 순서

1. `012_ems_source_routines.sql`과 역방향 migration: 원천 루틴 상태·버전 고유 제약.
2. EMS 워커: TIDAL 재탐색 예약, MusicBrainz 버전 확인·증분 후보 생성·기존 resolver 연결.
3. 관리자 API와 페이지·사이드바: 인증·동일 출처 검사, 소스별 상태와 조작.
4. 운영 문서와 변경 기록: 저장 위치, 주기, 실패 재시도, 디스크 제한, 기존 작업 보호.
5. 로컬 문법·타입·빌드, 운영 migration·서비스 상태·루틴 예약·신규 후보 흐름을 확인한다. 자동 테스트는 요청되지 않아 추가·실행하지 않는다.

## 완료 기준

- 현재 진행 중인 수동 수집과 사용자 데이터가 유지된다.
- 새 버전이 없을 때 원본 다운로드·중복 staging이 일어나지 않는다.
- 새 버전이 있을 때 manifest 검증 후 신규 MBID/ISRC만 후보가 되고, TIDAL 확인·임베딩으로 이어진다.
- TIDAL 재탐색이 작업 완료 후 다시 예약되며 429 `Retry-After`와 최소 요청 간격을 따른다.
- 관리자 메뉴에서 모든 루틴의 실제 상태·다음 실행과 오류를 확인한다.
