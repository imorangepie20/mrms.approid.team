# 메인·EMS K-Pop 섹션 3개 추가

## 결과

사용자 요청으로 `kpop-hits`(지금 듣는 K-Pop), `kpop-classics`(다시 만나는 K-Pop 클래식), `kpop-cafe`(카페에서 흐르는 K-Pop)를 두 화면 상단에 추가했다. 각 12곡, 총 36곡이다. 기존 노출 곡과 중복 없이 기존 활성 EMS에 등록된 곡만 사용한다. 메인은 새 섹션 뒤에 기존 3개를 유지해 총 6개·72곡, EMS는 기존 5개를 유지해 총 8개·96곡이다. 기존 Spotify 차트도 유지한다.

TIDAL PUBLIC EDITORIAL `K-Pop Hits` / `Certified K-Pop: Best New Tracks`, `K-Pop: Headphone Classics` / `K-Pop Classics`, `K-Pop Cafe Shop Music`을 원본으로 삼았다. 원본 ISRC와 확정 TIDAL ID로 EMS를 연결하고 최신 KR STREAM·30초 이상을 확인했다. 제목·아티스트로 장르를 추정하지 않는다. EMS의 3곡은 저장된 ISRC가 비어 있지만 원본에 ISRC가 있고 확정 TIDAL ID로 연결된다. 원본 ISRC는 운영 선정 artifact에 보존했고 해당 트랙 메타데이터를 변경하지 않았다.

## 구현·운영 경계

- 기능 커밋 `6b19816`, 소스·회귀·계획 17파일. 이 요청에서 Git push는 수행하지 않았다.
- 공개 API의 최대 섹션 수 5→8, 메인 요청 3→6, EMS 요청 5→8, 관리자 표시 안내를 수정했다. 기존 rail·재생/좋아요·검색을 사용한다.
- 선곡 정의·기준에 새 3개를 추가했다. 관리자 미리보기/적용은 8개 모두 각각 6~12곡을 요구한다. 요청 budget 24→36을 명시했으며 실제 운영 읽기 전용 전체 미리보기는 26요청으로 8×12곡을 확보했다. 기존 stale·만료·transaction·동시 적용·origin/관리자 권한 경계를 유지한다. 이전 5개짜리 미리보기는 새 기준으로 적용할 수 없으므로 새 미리보기를 만든다.
- 단일 transaction에서 공통 섹션 3개·membership 36개·화면 설정 6개를 추가했다. 기존 20개 화면 설정은 sort_order만 +3이며 상대 순서·제목·설명·active·timestamp는 같다. 기존 공통 10개 섹션·120개 membership·개인 관련 18개 테이블의 count/hash를 보존했다.
- Web은 검증한 Git archive로 새 이미지, pipeline은 현재 Melon 수정 image를 base로 `editorial_sections.py`와 `editorial_refresh.py` 두 파일만 변경했다. 비대상 모듈 18개·Melon 원문 SHA와 SSD source-routines를 보존했다.
- `/home/approid/apps/music-pie/shared/compose.kpop-sections.yml`에 두 image만 지정했다. 기존 current symlink와 SSD override를 유지한다. 다음 Compose 적용에는 SSD override와 이 override를 포함하거나 검증된 후속 이미지로 대체해야 한다. 이 override는 이전 Melon image override를 대체한다.

## 완료 체크

- **C1 PASS** — `prepare.py`, `apply.py`, `verify.py` exit 0. 3×12곡, 원본 ISRC/provenance·최신 KR STREAM·활성·duration 조건, 신규 ID 중복/기존 membership 겹침 0. 선정 JSON SHA `e333a0061afc4bdf9882523c5f44f65d9e8603f28256b94b14fee2e8222464f8` 일치.
- **C2 PASS** — Python 121개, Web 관련 6파일·56개, Admin 5파일·13개 테스트 통과. 두 앱 lint exit 0(기존 경고 Web 8·Admin 38), TypeScript/build exit 0. 격리 `editorial_refresh_check` DB에서 34 migration·8섹션 96곡 미리보기 쓰기 0·관리자 적용 11개 assertion 묶음(실패 전체 rollback·동시 적용·정확 저장·설정/사용자 보존 포함) 통과. 운영 두 이미지 build exit 0, 소스 16파일 SHA 일치.
- **C3 PASS** — `apply-verification.json`, `final-verification.json`, `verify.py` exit 0. 신규 3/36/6행 정확 일치, 기존 10/120/20행과 개인 18개 테이블 보존. 두 화면의 기존 노출 섹션/곡은 API 전후 exact 비교 일치.
- **C4 PASS** — Web healthy·pipeline running·두 restart 0, 내부/공개 readiness 200. 실제 비대상 container ID 68개 보존. SSD mount 유지, Melon SHA `0d04a0924a3ed0cc2377343d01482a887f09741f3a7ec7f6ab818c84920de43a`, 비대상 pipeline 모듈 18개 동일. 새 worker 오류 0.
- **C5 PASS** — SSH로 연결한 실제 운영 Web `/`·`/ems`에서 1440px/390px 4조건의 모든 72/96곡 DOM 제목/순서와 API가 일치한다. 신규 3개 heading·각 12곡·메인 더 보기 6개, 화면 가로 넘침 0, console error 0, 실제 End/Home 키의 끝/처음 이동·포커스 유지 확인. `browser-verification.json`, `keyboard-*-final.json`, 두 모바일 screenshot을 저장했다.

운영 artifact: `/home/approid/apps/music-pie/shared/artifacts/20261009-kpop-sections/`. 로컬 브라우저 증거: `C:/Users/jowoo/AppData/Local/Temp/music-pie-kpop-20261009/`.

Web image `sha256:56ff14d257cb426c0473c50653e5376c7e2b31766cb2c10593b6e6f3517bd2b2`, pipeline image `sha256:1c729aa55649c5ce6da37b78a63f857b1ae395e7d446a512659bf413913adcad`. 태그는 각각 `music-pie-web:kpop-sections-6b19816`, `music-pie-ems-pipeline:kpop-sections-6b19816`이다. 이전 image는 `pre-kpop-20261009` 태그로 보존한다. 운영 초기 상태는 `before.json`, 적용 상태는 `after.json`으로 보존한다. 복구 시 신규 3개만 제거하고 기존 screen sort_order를 snapshot 값으로 복원하며 개인 데이터/전체 DB는 덮어쓰지 않는다.

검증 도구의 Windows CRLF hash 비교, source-routines container 이름, 스크롤 animation 종료 시점/허용 오차를 정정하고 전체 검증 세트를 다시 실행했다. ISRC gate도 원본 ISRC와 기존 저장 ISRC를 구분하도록 조사 근거에 맞춰 정정했다. 제품 오류를 숨기기 위한 데이터 수정은 하지 않았다.

## 미검증·다음 작업

필수 완료 체크의 FAIL/UNVERIFIED는 없다. 실제 TIDAL 오디오 재생, 실제 iOS/Android 및 로그인 관리자 버튼의 실운영 적용은 실행하지 않았다. Cloudflare/Auth0 비로그인 외부 브라우저는 로그인 화면으로 이동하므로 화면 QA는 기존 SSH 권한으로 실제 운영 Web에 연결해 비회원 상태로 실행했다. 운영 갱신은 읽기 전용 미리보기까지만 확인했고 실제 적용 transaction은 격리 DB에서 검증했다.

스킬 실행은 `ui-ux-pro-max` 로컬 `SKILL.md`와 기존 `TrackRail` 소스를 읽고 viewport overflow UX 검색을 실행한 것이다. 다른 plugin 설치나 환경 설정 변경은 하지 않았다.

## Hindsight 기록

앞선 사용자 요청에 따라 기존 `music-pie` 뱅크를 확인한 뒤 날짜 문서 `music-pie-kpop-screen-sections-2026-10-09`를 추가했다. 완료 시각은 2026-10-09 09:20:37 KST다. operation `65242aaa-12cb-48c3-9063-3c59b256182d`와 child operation 모두 completed·오류 null이며 새 문서 memory 6개를 생성했다. 원문 SHA `ec051dbc368b0b7524bb004ea49f4028a89f51ae8879a1b0691a5cf78aa70891`이 일치한다. 비밀값·개인 행동 데이터·원본 API 응답은 저장하지 않았다.

- **H1 PASS** — 등록 전 새 document ID 없음(404), 기존 프로젝트 등록 문서 전체 일치, 다른 뱅크 4개 전체 상태 일치. `hindsight-*-before/after.json`와 검증 script exit 0.
- **H2 PASS** — retain HTTP 200·operation 완료·원문 정확 일치·memory 6개. 날짜/K-Pop 태그로 recall한 6개 모두 새 document provenance이고 K-Pop 내용이 검색된다. `hindsight-final-verification.json`, `hindsight-recall.json`과 검증 script exit 0.
