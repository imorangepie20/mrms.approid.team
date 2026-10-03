# 관리자 홈·EMS 선곡 갱신

## 요청과 결과

- 사용자가 이번 선곡 기준을 확인하고 관리자 페이지에서 실행할 수 있는 기능을 요청했다.
- 관리자 `화면 관리 → 메인 화면 / EMS 화면` 양쪽에 공통 선곡 기준, 갱신 미리보기, 확인 후 적용, 마지막 갱신 시각을 추가했다.
- 기능 커밋 `5f165a93606a7a8074eea1466bf33be065315f08`을 운영 배포했다. 033 migration 1개를 적용했으며 source-routines는 교체하지 않았다.
- 운영 미리보기 `191faec4-3b67-4163-bbf8-508d484592b4`는 5개 섹션 각 12곡, 추가/제외 모두 0이었다. 앞선 13:59 갱신과 같은 선곡임을 확인한 뒤 14:35:37 KST에 적용 상태를 검증했다. 홈 36곡·EMS 60곡은 저장된 미리보기와 정확히 일치한다.

## 선곡 기준

- TIDAL 검색 결과에서 20곡 이상인 공개 `EDITORIAL` 플레이리스트만 사용한다. 섹션별 이름 규칙에 맞는 원본 최대 2개, 각 원본 첫 페이지를 조회한다.
- 신곡: `Best New Tracks` / `New Arrivals`. 원본 최근 갱신 시각 우선으로 플레이리스트를 고르고, 원본 순서·곡 인기도·원래 곡 순서·팔로워 수·TIDAL ID로 곡을 정렬한다. 최근 갱신은 트랙 발매일과 다른 기준이다.
- 재즈: `Jazz`; R&B: `R&B` 검색 및 R&B/Soul 원본 이름; 팝·댄스: `Pop` / `Dance`; 집중: `Classical` / `Focus`. 플레이리스트 팔로워 수·곡 인기도·원래 곡 순서로 정렬하고 ID로 동점을 결정한다.
- ISRC가 있는 30초 이상 트랙을 기존 EMS의 TIDAL ID 또는 ISRC로 연결한다. 관리자 미리보기에서는 활성 상태와 최신 KR STREAM `playable=true`를 후보 선택 전에 확인해 빈 자리를 다음 후보로 채운다.
- 섹션당 최대 12곡, 섹션 간 track ID 중복 제거. 5개 섹션 모두 각각 6곡 이상이어야 관리자 적용을 허용한다.
- 개인화 GMS 추천·멜론 수집 순서와는 별개다. 섹션별 검색어나 곡을 직접 지정하는 설정은 이번 기능의 범위에 포함하지 않았다.

## 동작과 상태 경계

- API는 관리자 인증과 같은 origin을 확인한다. 미리보기 요청은 빈 JSON, 적용 요청은 저장된 ID와 `action=apply`만 허용한다. 외부 URL·선곡 배열·요청 예산을 클라이언트에서 받지 않는다.
- 기존 EMS worker가 외부 조회를 담당한다. 기존 장기 TIDAL 처리 중에도 미리보기 실행 기회를 주며 요청 budget 24·timeout 8초를 적용한다.
- 미리보기는 job 테이블만 쓰고 노출 membership은 변경하지 않는다. 후보·원본 playlist ID/이름·변경 전 section/membership snapshot을 보관한다.
- `pending → running → ready / blocked / failed`, `ready → applied / expired`를 사용한다. 진행 중 미리보기는 DB unique index로 하나만 허용하며 새 미리보기 요청은 기존 ready 미리보기를 만료시킨다. worker timeout은 10분, ready 유효 기간은 30분이다.
- 적용 시 job row와 선곡 테이블을 잠그고 만료·중복·부족·기존 목록 변경·최신 재생 불가를 다시 확인한다. 트랙/availability 쓰기를 짧은 적용 transaction 동안 잠가 확인 조건을 commit까지 유지한다.
- 저장된 미리보기의 track ID/rank/원본을 그대로 전체 transaction에서 교체한다. 오류 시 앞 섹션 교체까지 rollback한다. 화면별 제목·설명·순서·노출·사용자 개인 데이터·비대상 membership을 보존한다.
- Headless UI `Dialog`에 HUD 템플릿 스타일을 적용했다. 취소 초기 포커스, Escape 취소, 트리거 포커스 복귀와 모바일 표시를 확인했다.

## 검증 결과

- **C1 PASS**: `python -m pytest services/ems-pipeline/tests -q` → exit 0, 110 passed. 기존 선곡 순위·중복 제거 11개와 신규 5개 테스트, 격리 fixture의 최신 KR false·US-only·30초 미만 제외를 확인했다. 기준 문구를 `editorial_sections.py`, `tidal_popularity.py`와 대조했다.
- **C2 PASS**: 격리 `editorial_refresh_check` DB에서 001~033 up, 033 down/reapply, Python fixture와 실제 TypeScript 적용 함수를 실행해 exit 0. 선곡 쓰기 없는 미리보기·60곡 고정 projection과 11개 assertion 묶음(잘못된/없는 ID, 만료, 부족, stale, 최신 재생 불가, 중간 SQL 실패 전체 rollback, 동시 적용 1회, 정확한 미리보기 저장, 화면/사용자 보존, 동시 미리보기 1회)을 확인했다.
- **C3 PASS**: 새 관리자 route 테스트 20개를 포함한 관련 Web 테스트 7파일·41개 통과. 인증 401/403, origin 403, 입력 400, 상태 404/409와 클라이언트의 ID-only 적용을 확인했다. 운영 비로그인 GET/POST는 401이다.
- **C4 PASS**: 동일 Admin build를 격리 HTTP fixture에서 실제 Chrome으로 검증했다. 미리보기 pending/ready, 기준·원본·변경 수 표시, 커스텀 확인창, Escape 취소·취소 초기 포커스·트리거 포커스 복귀, 확인 후 성공 표시를 확인했다. 요청 로그는 preview POST 1회·apply POST 1회·취소 POST 0회다. 390×844에서 document width 382로 가로 넘침 없이 확인창이 표시된다. 운영 로그인 브라우저에서 메인/EMS 양쪽 패널과 ready/applied·커스텀 확인 취소를 확인했다.
- **C5 PASS**: Python 110개, Web 관련 41개, Admin 전체 5파일·13개 테스트 통과. Web/Admin lint 오류 0(경고 각각 8/38개; Web 2개는 검증 스크립트의 제외용 destructuring 변수), 두 앱 타입/production build와 `git diff --check` 통과. Admin build는 저장소 밖 temp 디렉터리에 출력했다.
- **C6 PASS**: backup `pg_restore --list` 및 SHA 검사, 033 이관, 두 이미지 revision과 readiness 확인. 실제 TIDAL worker 미리보기와 운영 적용 함수의 결과가 공개 홈 3/36·EMS 5/60 및 로그인 화면과 일치한다. 미리보기/취소 쓰기 0, 개인 데이터 18개 테이블·독립 설정·비대상 membership 불변. source-routines ID·시작 시각·이미지 불변, Web/EMS healthy·restart 0. 같은 Melon 작업에서 후보 326→343·발견 380→400과 heartbeat 진전을 확인했다.

운영 적용 자체는 브라우저 확인 버튼을 누르지 않고 서버에서 동일 `applyEditorialRefresh` 함수를 operator actor로 실행했다. 실제 버튼→API→완료 동작은 격리 UI fixture로, 운영 API의 인증/입력 경계는 route 테스트와 비로그인 HTTP로 검증했다.

## 운영 artifact와 복구 근거

- 디렉터리: `/home/approid/apps/music-pie/shared/artifacts/20261003-admin-editorial-refresh/`.
- `postgres-verification.txt`, `deployment.txt`, `verification.txt`, `diagnostic.txt`, `images.txt`, `services-before.txt`, `services-after.txt`, `before-deploy.json`, `after-preview.json`, `after-apply.json`, `applied.json`, `home-api.json`, `ems-api.json`, `worker-before-apply.json`, `worker-after-apply.json`에 증거를 기록했다.
- release: `/home/approid/apps/music-pie/releases/20261003-admin-editorial-5f165a9`.
- Web image: `sha256:6fb5832521a1a8463cf1973ec1426ba344fc7fef8d0d11828b20c0e2c10054d5`.
- EMS image: `sha256:8bc7c43d1613340c9a69877cf5c56d752bab37f237bf21f8eb8b52ff8e9ff646`.
- backup: `/home/approid/apps/music-pie/shared/backups/music-pie-pre-admin-editorial-5f165a9.dump`, 241,146,193 bytes, SHA-256 `811ac58b3f429752bc9f32d00babfba5076e0ee7fd5e543e2a6e42511c732bf1`.
- 직전 release `20261003-melon-sql-21f12c6`과 `music-pie-web:pre-editorial-20261003`, `music-pie-ems-pipeline:pre-editorial-20261003`을 유지한다. 복구 시 앱 이미지/release만 되돌리고 033과 선곡 데이터는 임의로 제거하지 않는다. 선곡 복구는 job backup과 변경 전 snapshot을 검토해 대상 membership만 복원한다.
- 브라우저 증거: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/admin-editorial-refresh/`의 `ui-api-evidence.json`, `production-ui-verification.txt`, `confirm-test-desktop.png`, `confirm-test-mobile.png`, `applied-test-mobile.png`, `production-confirm.png`, `production-applied.png`.

## 재검증과 미검증

- 첫 운영 HTTP 검사에서 비로그인 관리자 페이지의 정상 307을 200으로 기대한 검증기 오류를 수정했다. 격리 DB 반복 검사에는 초기 Unix 소켓 서버를 ready로 오인하는 race가 있어 실제 TCP ready를 기다리도록 수정했다. 스크립트 조립 시 누락된 줄바꿈도 수정했다. 제품 코드 수정 없이 전체 검증 증거를 다시 확인했다.
- 공개 API 재검증 중 520이 한 번 발생했다. 이후 내부 Home/EMS API 200(약 0.25초), 공개 Home/EMS/readiness 200과 전체 운영 검증을 재확인했다. Web 로그 오류와 재시작은 없었다. 정확한 520 원인은 재현되지 않아 확정하지 않았다.
- 필수 완료 기준의 FAIL/UNVERIFIED는 없다. 일회성 520의 정확한 원인, 실제 휴대전화·오디오 스트리밍·운영 backup 복원 실행은 검증 범위 밖이며 미검증이다.
- 관리자 선곡 기준 편집·수동 선곡·예약 갱신은 다음 요청이 있을 때 범위를 확정한다.
