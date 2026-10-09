# 메인·EMS K-Pop 섹션 3개 추가

## 요청·설계

메인과 EMS에 K-Pop 섹션을 각각 3개 추가한다. 기존 rail과 관리자 화면 설정을 사용한다. `kpop-hits`(지금 듣는 K-Pop), `kpop-classics`(다시 만나는 K-Pop 클래식), `kpop-cafe`(카페에서 흐르는 K-Pop)를 앞에 배치하고 기존 화면 순서는 3만큼 이동해 상대 순서·문구·노출과 현재 보이는 섹션을 보존한다. 메인 표시 한도는 3→6, EMS는 5→8이다.

TIDAL PUBLIC EDITORIAL 목록의 정확한 K-Pop 이름 근거로 선정한다. 기존 활성 EMS·최신 KR STREAM·30초 이상·ISRC 조건을 적용하며 원본 playlist ID/이름을 저장한다. 기존 곡 membership은 이번 추가에서 교체하지 않는다. 신규 선곡은 기존 노출 곡과 중복을 피하고 섹션당 6~12곡을 확보한다. 사용자별 데이터는 변경하지 않는다.

## 의존 순서·변경 파일

1. `editorial_sections.py`의 기존 5개 정의 뒤에 3개를 추가한다. `editorial_refresh.py`와 Web `editorial-refresh.ts`의 개수 gate를 정의 수 기준으로 바꾸고 요청 budget을 24→36으로 명시한다. 기존 origin·권한·적용 transaction·상태 경계를 유지한다.
2. Web 공개 API/repository 한도, 메인·EMS fetch 개수, Admin 표시 안내를 수정한다. 관련 회귀와 실제 DB 적용 검증을 실행한다.
3. 읽기 전용 운영 후보 선정·백업 후 신규 3개 공통 membership과 6개 화면 설정을 단일 transaction으로 추가한다. 기존 화면 sort_order에만 +3을 적용한다. 기존 사용자 테이블 fingerprint·비대상 membership·서비스 상태를 비교한다.
4. Web과 EMS pipeline만 적용한다. SSD source-routines·Melon 수정·다른 서비스 image와 실행을 보존한다. 공개 API와 브라우저 화면을 검증한다.

## 객관적 완료 체크

- C1: 실제 TIDAL 원본 근거, 신규 3개 각각 6~12곡, 활성·최신 KR STREAM·30초·ISRC·섹션간 중복 0을 SQL/선정 artifact로 확인.
- C2: 관련 Python/Web/Admin 회귀, 두 앱 lint/build, 격리 DB 관리자 8개 선곡 적용·rollback·동시 적용 검증 명령 exit 0.
- C3: 운영 새 membership/화면 설정 정확 일치, 기존 설정은 sort_order +3 외 동일, 기존 membership·개인 테이블 count/hash 보존. snapshot hash 검증.
- C4: 운영 Web/pipeline image source 일치·healthy·restart/오류 확인, 비대상 실제 container ID 보존, source-routines SSD와 Melon patch 보존, 내부 readiness 200.
- C5: 메인 6·EMS 8개 공개 API/브라우저에 신규 3개·곡 순서 일치, desktop/390px·keyboard·가로 넘침·console 오류 확인. 로그인 화면 접근이 불가능하면 동일 운영 build의 격리 UI 검증을 구분하고 운영 API 검증을 유지한다.

첫 전체 검증 pass의 비통과가 2개를 넘으면 증상 수정을 멈추고 최초 실패 계층을 보고한다. 그 외에는 원인을 수정한 뒤 전체 체크를 다시 실행한다.
