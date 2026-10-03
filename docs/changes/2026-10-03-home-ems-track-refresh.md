# 홈·EMS 운영 노출 트랙 갱신

## 요청과 결과

- 사용자가 홈과 EMS 페이지에 노출되는 트랙 업데이트를 요청했다.
- 기존 노출 membership 갱신 시각은 `2026-09-27 01:16:31 UTC`였다. 일반 수집 루틴은 이 membership을 자동 갱신하지 않는다.
- 최신 TIDAL 에디토리얼 원본으로 5개 섹션을 다시 연결하고 `2026-10-03 04:59:51 UTC`(13:59:51 KST)에 저장했다.
- 홈은 3개 섹션·36곡 중 이전 화면 목록에 없던 7곡, EMS는 5개 섹션·60곡 중 이전 화면 목록에 없던 11곡을 표시한다.
- 코드·이미지 변경 없이 운영 데이터만 갱신했다. Web/EMS/source-routines 컨테이너를 재시작하지 않았다.

## 선정과 저장

- `services/ems-pipeline/src/ems_pipeline/editorial_sections.py`의 기존 `discover_editorial_memberships`와 `sync_editorial_sections_guarded`를 사용했다.
- 조회 범위: playlist limit `2`, 요청 budget `24`, timeout `8초`. dry-run은 DB `READ ONLY` transaction에서 실행했다.
- dry-run에서 확보한 동일 후보 목록을 운영 artifact에 보관하고 실제 sync에서도 재사용했다. 저장 전 모든 섹션 각각 6곡 이상, 최신 KR STREAM 재생 가능 조건과 변경 전 membership 일치를 추가로 확인했다.
- guarded sync의 단일 DB transaction에서 membership 60개를 저장하고 예상 track ID 및 최신 재생 가능 조건을 다시 확인한 뒤 commit했다.
- 제목·아티스트 이름으로 장르를 추정하지 않았다. 사용자별 추천 이력, 거절·좋아요·MMS 상태는 변경하지 않았다.

| 섹션 | 원본 후보 | 저장 | 섹션에 새로 추가 | 섹션에서 제외 |
|---|---:|---:|---:|---:|
| `new-releases` | 39 | 12 | 5 | 5 |
| `seasonal-jazz` | 38 | 12 | 0 | 0 |
| `night-rnb` | 38 | 12 | 2 | 2 |
| `feel-good` | 35 | 12 | 3 | 3 |
| `focus` | 26 | 12 | 2 | 2 |

- 재즈 원본은 기존 선곡과 동일해 12곡을 유지했다.
- 위 섹션별 추가 합계는 12곡이지만 `MORNING DEW (DONK)`는 기존 신곡 섹션에서 팝·댄스 섹션으로 이동했으므로 EMS 전체의 신규 track ID는 11개다.
- 신곡 섹션은 `So Good`, `Fly U Out`, `CAN I WATCH YOU (feat. Pharrell Williams)`, `YOU KNOW` 순으로 시작한다. 새로 포함된 곡에는 `YOU KNOW`, `Decimate`, `What’s It Gonna Take?`, `Bittersweet`, `Love-Again`이 있다.

## 운영 증거와 복구 근거

운영 artifact 디렉터리: `/home/approid/apps/music-pie/shared/artifacts/20261003-home-ems-refresh/`.

- `before.json`: 변경 전 전체 section 10개, membership 120개, 독립 화면 설정 20개. 사용자 데이터는 내용 대신 18개 테이블의 count·fingerprint만 기록했다.
- 변경 전 snapshot SHA-256: `adef60384754eaf090b7e087823c43622e1d636b46ba888972e50278efefd63b`. JSON 읽기와 `sha256sum --check backup.sha256` 성공을 확인했다.
- `after-dry-run.json`, `discovered.json`, `projected.json`, `applied.json`, `after.json`: 읽기 전용 미리보기, 원본 후보, 예상 ID, 저장 결과, 실제 상태.
- `home-api-before.json`, `ems-api-before.json`, `home-api-after.json`, `ems-api-after.json`: 공개 API의 변경 전후 응답.
- `services-before.txt`, `services-after.txt`, `verification.txt`: 서비스 ID·이미지·시작 시각·restart count와 검증 출력.
- 복구가 필요하면 대상 5개 section의 기존 필드와 membership을 `before.json` 기준으로 단일 transaction에서 복원한다. 독립 화면 설정·비대상 section·사용자 데이터나 전체 DB는 덮어쓰지 않는다. 실제 복구 명령은 이번 정상 갱신에서 실행하지 않았다.

## 완료 검증

- **C1 PASS**: `python -m pytest services/ems-pipeline/tests/test_editorial_sections.py -q` → exit 0, `11 passed`. dry-run 전후 snapshot 동일, 5개 section 모두 `joined=12 / stored=0`.
- **C2 PASS**: apply/verification 명령 exit 0. 실제 5 × 12 membership이 예상 ID와 일치, target track ID 전역 중복 0, 비활성 또는 최신 KR STREAM 불가 0. snapshot 10/120/20개 읽기와 SHA-256 검사 성공. 홈 신규 ID 7개, EMS 신규 ID 11개.
- **C3 PASS**: 공개 `/api/ems/sections?screen=home&region=KR&limit=12&sectionLimit=3` 및 `screen=ems&sectionLimit=5` HTTP 200, 각각 3/36과 5/60으로 DB projection 일치. 로그인 Chrome 실제 DOM의 모든 섹션 제목·36/60개 트랙 제목/순서를 API와 정확히 비교해 일치했다. `/`, `/ems` HTTP 200.
- **C4 PASS**: 독립 화면 설정·비대상 section/membership·사용자 관련 18개 테이블 count/fingerprint 불변. 3개 서비스 ID·이미지·시작 시각·restart count 불변, local/public readiness HTTP 200.

로컬 브라우저 증거: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/home-ems-refresh/`의 `browser-verification.json`, `home.png`, `ems.png`.

## 미검증과 다음 작업

- 필수 완료 기준의 FAIL/UNVERIFIED는 없다.
- 실제 오디오 스트리밍과 snapshot 복구 실행은 이번 목록 갱신 검증 범위에 포함하지 않았다.
- 원본 목록 자동 갱신 주기·관리자 갱신 버튼은 이번 요청에 포함되지 않았다. 현재 열려 있던 페이지는 새로고침하면 갱신된 목록을 조회한다.
