# GitHub 프로필 위시켓 전체 포트폴리오 반영

## 게시 결과

2026-10-04 사용자 요청으로 위시켓의 포트폴리오 네 개를 `https://github.com/imorangepie20`에 모두 반영했다. 프로필 전용 저장소 `imorangepie20/imorangepie20`의 README와 새 이미지 두 개를 수정·추가했다.

- 기준 커밋: `f68f0e0c75bd00f541043cf80bae07605b3aa5de`.
- 게시 커밋: `d61a0a0704773621784fc639f199bb4f0f9a3366` (`docs: include all Wishket portfolio projects in profile`).
- 변경: README 84행 추가, `assets/resm-dashboard.png`, `assets/alpha-momega-dashboard.jpg`.
- 계획: `docs/plans/2026-10-04-github-all-portfolios.md`.

## 원문 대조와 내용

| 위시켓 항목 | 참여 | GitHub 반영 |
|---|---|---|
| Music Pie (318670) | 2026.09~2026.10, 100% | 기존 상세를 보존하고 전체 목록·서비스/저장소/위시켓 링크 추가 |
| RESM (314478) | 2026.03~2026.07, 100% | 웹·Tauri 앱 단독 개발 역할, 매물/고객/계약/일정·엑셀·지도/실거래가·네이버 탐색, 사용자/권한/반응형, 데스크톱 트레이·창·링크, 플랫폼별 검증 범위와 스택 |
| B2B 유통 통합 시스템 (313889, B2B-STM) | 2026.08~2026.09, 100% | 기존 상세·근거 보존, 참여/역할, 계약 단가·미확보 대기/재배정·부분 출고·잔량 취소·모바일 피킹·반품·입금 정정, 시연 모델/외부 연동/SMTP 경계 보완 |
| Alpha Momega (312886) | 2026.08~2026.09, 100% | 기획/도메인/웹/API/DB/인증/테스트/배포 역할, 자산/임차인/계약·청구/영수증/배분·부분 수납/취소·미수·CSV·정비/점검·권한/감사, 정합성·서버 인증·오류 표시·검증·관리자 테마와 스택 |

원문: `https://www.wishket.com/partners/p/mibeen/portfolio/318670/`, `314478/`, `313889/`, `312886/`의 상세 페이지를 사용자가 사용 중인 어사이드 브라우저에서 읽었다. 전체 목록의 개수 4와 각 상세의 제목·본문·기간·참여율·역할·결과물 링크를 읽어 저장했다. 다른 프로젝트의 업무 데이터를 조회하거나 코드를 수정하지 않았다.

RESM과 Alpha Momega의 GitHub 저장소 URL은 각각 `real-es`, `real-es-desktop`, `ERP-Approid`의 origin을 식별 목적으로만 확인했다. 실제 기술은 위시켓 본문의 스택 기준으로 작성하고, 기술 태그에만 있는 SQLite 등을 현재 운영 DB로 확대하지 않았다.

두 새 이미지는 위시켓에 이미 공개된 실제 대시보드 화면을 브라우저의 pageAssets 기능으로 그대로 확보했다. 업로드 이전에 화면을 확인했고, RESM의 테스트용 샘플과 Alpha Momega의 2026-09-13 가상 데이터·검수 이력 및 금액/건수가 사업 성과가 아니라는 안내를 유지했다. 이미지를 편집하거나 다른 운영 데이터를 공개하지 않았다.

## 검증 결과

- A1 PASS: 원문 4개·목록 4개·상세 섹션 4개·100% 참여 표시 4개를 대조했다. 기간·역할·기능·스택을 확인했고 대표 기능 용어 79개(13/24/18/24)가 원문과 대응 상세에 모두 존재한다. `wishket-sources.json`, `coverage.json`이 근거다. macOS는 문서화, Windows/Linux는 당시 빌드·실행 검증 범위로 구분했다.
- A2 PASS: 기존 Music Pie 상세는 문자열 일치, B2B 본문 전체는 새 원고에 그대로 포함됨을 확인했다. 기존 경력·연락처·bullet/table 행과 이미지 3개의 Git blob을 보존했다. 변경 파일은 README와 새 이미지 2개뿐이며 `git diff --check f68f0e0 HEAD` exit 0이다.
- A3 PASS: 전체 목록의 고유 외부 링크 13개 HTTP 200. 일부 서비스·위시켓은 비로그인 HTTP 조회 시 로그인 페이지로 이동하며 실제 위시켓 본문은 브라우저에서 확인했다. 원격 main SHA는 `d61a0a0…`와 일치하고 최종 커밋의 raw README·새 이미지 두 개가 local Git blob과 byte 단위로 일치한다.
- A4 PASS: 공개 GitHub 프로필에 전체 목록 4행·상세 제목 4개, 이미지 5장(기존 표지/Music Pie/B2B + 새 RESM/Alpha Momega)이 모두 로드됐다. `public-render.json`, `published-profile.txt`, `all-projects-profile.png`에 저장했다.
- 필수 미검증: 없음. 제품 기능의 현재 재실행이나 운영 배포 검사는 이 프로필 게시 범위 밖이다. 기존 포트폴리오의 검증 설명은 해당 시점의 근거로 소개했다.

## 증거와 후속

증거 디렉터리: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/github-all-portfolios/`. 최종 전체 A1~A4 결과 및 링크 응답은 `verification.json`에 있다.

위시켓 항목이 추가되거나 기능·참여 정보가 바뀌면 GitHub 전체 목록과 해당 상세를 함께 갱신한다. 위시켓 원문 및 프로젝트 운영 환경은 이번 작업에서 수정하지 않았다.
