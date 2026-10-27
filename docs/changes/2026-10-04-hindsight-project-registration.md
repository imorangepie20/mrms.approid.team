# Hindsight Music Pie 프로젝트 등록

## 변경

2026-10-04 사용자 요청으로 기존 로컬 Hindsight 0.10.2 HTTP API에 Music Pie를 등록했다. 기존 두 프로젝트와 분리된 `music-pie` 뱅크(표시 이름 `Music Pie`)를 생성했다. 앱 코드·운영 배포·MCP 설정은 변경하지 않았다.

- API: `http://127.0.0.1:8888`.
- 뱅크: `music-pie`.
- 문서 ID: `music-pie-project-registration-2026-10-04`.
- 비동기 operation UUID: `0ba14007-0c1a-4c13-8b59-56926b84806a`.
- 완료 시각: `2026-10-03T21:57:02.775533+00:00` (2026-10-04 06:57 KST).
- 원고: `docs/changes/2026-10-04-hindsight-project-snapshot.md`, 5,013자·8개 섹션·17개 근거 파일.
- 원고 SHA-256: `045abdb222f0e31dd27a4c47b77349fa9684f8d75192318d0dbe8c082cdc3fa9`.

목적·서비스/저장소·EMS/GMS/MMS·TIDAL 연동·추천/취향/오디오·수집·실제 관리자 메뉴·기술 스택·문서상 최근 배포·검증 이력·확인된 제한·작업 규칙을 저장했다. 사용자 이력서나 인증 비밀값은 입력하지 않았다. 고정 문서 ID와 원문 hash를 기록해 후속 갱신 시 같은 등록을 식별할 수 있게 했다.

## 완료 기준 결과

- H1 PASS: 원고의 8개 섹션, 17개 근거 파일 존재와 목적·URL·스택·배포·추천 경계·제한을 실제 문서와 대조했다. `current-development-context.md:5–11`, `wishket-portfolio-content.md:5–25`, `editorial-refresh-variety.md:24–33` 및 사용자 Work-unit gate가 주요 근거다. 토큰·쿠키·개인 이력서 정보가 없는 프로젝트 원고만 제출했다.
- H2 PASS: 뱅크 생성과 retain HTTP 200. operation과 child operation `completed`, 오류 없음. 문서 목록 total 1, 고정 ID 원문 재조회 정확히 일치, 추출 memory 12개. `document_metadata`의 프로젝트·원고 경로·날짜·SHA-256도 일치한다.
- H3 PASS: 태그 `music-pie`의 recall HTTP 200. 목적·EMS/GMS/MMS·영구 제외를 포함한 결과 17개 중 원문 문서 연결 memory 12개가 반환됐다. 사용자별 제외 질의를 world 유형으로 별도 검색해 같은 문서의 결과 12개와 영구 제외 설명을 확인했다.
- H4 PASS: 기존 `approid-desk`, `hotelChainManager` 두 뱅크의 ID·name·updated_at·fact_count(각 125, 9)가 전후 동일하다. 이번 변경은 계획·등록 원고·결과·환경 기록 문서뿐이며 `git diff --check` exit 0이다.
- 필수 미검증: 없음.

## 증거와 다음 작업

재현 가능한 API 읽기: `GET /v1/default/banks`, `GET /v1/default/banks/music-pie/documents`, `GET /v1/default/banks/music-pie/documents/music-pie-project-registration-2026-10-04`, `GET /v1/default/banks/music-pie/operations/0ba14007-0c1a-4c13-8b59-56926b84806a`, `POST /v1/default/banks/music-pie/memories/recall`.

원본 검증 JSON은 로컬 임시 경로 `C:/Users/jowoo/AppData/Local/Temp/music-pie-hindsight-*.json`에 보존했다. 비공개 서비스 환경 변수와 다른 프로젝트의 memory 원문을 조회·저장하지 않았다. 제품 기능 검증·운영 수치의 최신성 재검사는 등록 범위 밖이며 날짜가 있는 기존 문서의 사실로 기록했다.

다음 프로젝트 상태 변경 시 근거 문서를 먼저 갱신하고 `music-pie` 뱅크에 새 날짜의 기록 또는 명시적인 동일 문서 갱신을 수행한다. 자동 동기화는 구성하지 않았다.
