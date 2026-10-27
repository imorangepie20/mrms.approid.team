# Music Pie 위시켓 포트폴리오 원고·근거

## 입력 기준

- 제목: Music Pie — TIDAL 연동 음악 취향 분석·개인화 추천·라이브러리 플랫폼
- 참여: 2026.09~2026.10, 100% 개인 프로젝트(사용자 확인). 현재 운영 및 개선 중.
- 실제 서비스: https://mrms.approid.team/
- 저장소: https://github.com/imorangepie20/mrms.approid.team
- 기획·디자인·개발 / 웹 / 분야는 위시켓 제공 분류 중 적합한 항목을 선택한다.
- 사용자 화면 기술은 Next.js 16/React 19/TypeScript/Tailwind, 관리자는 React 18/Vite/HUD/Headless UI, 서버·분석은 Python/FastAPI, 저장소는 PostgreSQL/pgvector, 운영은 Docker Compose/Zorin Linux/Cloudflare Tunnel이다. Spring/Tomcat·CLAP·자연어 음악 검색을 구현 기술로 기재하지 않는다.

## 기능별 근거 목록

| 묶음 | 코드·문서 근거 |
| --- | --- |
| 회원/관리자 인증, TIDAL OAuth·Device Code | apps/web/src/lib/auth/admin.ts; docs/deployment/tidal-full-playback-implementation.md |
| 온보딩·선택 플레이리스트 가져오기·진행 표시 | apps/web/src/app/onboarding/page.tsx; docs/changes/2026-09-29-onboarding-taste-analysis-progress.md |
| 검색/음악 상세/전역 재생/큐/전체 플레이어 | apps/web/src/app/search/page.tsx; apps/web/src/components/player/; docs/changes/2026-09-25-full-player-visual-refresh.md |
| MMS 좋아요 보관·내부 플레이리스트·수락곡 | apps/web/src/app/mms/page.tsx; docs/changes/2026-10-03-gms-functional-fixes.md |
| GMS 사용자별 추천/피드백·영구 제외·중복 노출 이력 | apps/web/src/app/gms/page.tsx; docs/changes/2026-09-29-gms-permanent-recommendation-history.md; docs/changes/2026-10-03-gms-history-selection.md |
| 텍스트 취향·군집/오디오 분석·제한 하이브리드 | docs/overview/taste-analysis-system.md; services/embedding/; services/audio-analysis/; docs/changes/2026-09-29-hybrid-full-coverage-activation.md |
| EMS 수집/검증/출처/임베딩·멜론 순환 | services/ems-pipeline/src/ems_pipeline/; docs/changes/2026-10-03-melon-five-track-round-robin.md |
| URL 검토·승인 | apps/admin/src/pages/UrlImports.tsx; docs/changes/2026-09-26-admin-url-import.md(실수집 결과 운영 검증 범위를 확대해 기재하지 않음) |
| 관리자 화면/관제·홈/EMS 독립 설정·선곡 갱신 | apps/admin/src/pages/; docs/changes/2026-10-03-admin-editorial-refresh.md; docs/changes/2026-10-03-editorial-refresh-variety.md |
| 실제 사용 중인 관리자 상위 네 메뉴 | apps/admin/src/components/layout/Sidebar.tsx:43–70; EMS Overview, EMS, 화면 관리, 추천·취향의 운영 화면 |
| 운영/헬스체크/데이터 경계/검증 | infra/compose.zorin.yml; docs/project-rules/core-principles.md; docs/changes/2026-10-03-editorial-refresh-variety.md |

## 검증 원칙

하이브리드는 제한 사용자·완전 coverage에서 활성화하고 미달 시 텍스트 baseline으로 돌아간다는 조건을 명시한다. 정확도 향상률·상업 고객·전 사용자 적용·매출·트래픽 성과는 확인되지 않아 주장하지 않는다. 일반 템플릿의 Calendar/ERP 등 샘플 화면을 Music Pie 기능으로 소개하지 않는다.

게시 본문·플러스 항목·이미지 수와 최종 상세 URL/기존 3개 보존 검증은 저장 후 기록한다.

## 게시 결과와 검증

- 새 공개 포트폴리오: https://www.wishket.com/partners/p/mibeen/portfolio/318670
- 사용자 지정 어사이드 브라우저의 기존 위시켓 입력 화면에서 등록했다. 업로드에 필요한 확장 프로그램의 파일 URL 접근 권한은 사용자가 직접 설정한 뒤 재개했다.
- 본문 4,190자(10개 주제), 개발 배경 614자, 성과 4개, 진행 단계 5개, 핵심 기능 5개 묶음, 기술 태그 12개를 저장했다. 핵심 기능 칸의 최대 5개 제한 안에서 전체 기능을 묶었으며 상세 본문에는 개별 기능을 유지했다.
- 참여 기간 2026.09~2026.10, 참여율 100%, 개인 프로젝트와 전담 역할을 반영했다. 개발·디자인·기획 / 웹 / SaaSㆍ솔루션·데이터 분석ㆍBI·기타(AIㆍ머신러닝)를 등록했고 공개 상태를 확인했다.
- 480×480 표지와 홈·EMS·GMS·MMS 4장, 관리자 6장 등 이미지 10장 및 캡션을 등록했다. 로그인 연락처가 보이는 헤더를 제외한 실제 제품 화면이다. 관리자 이미지는 운영 현황, 트랙 품질, 홈 콘텐츠 편집, 홈·EMS 선곡 갱신, 취향 분석 설계, 오디오 분석 관측을 담았다.
- 사용자 확인에 따라 관리자 상위 네 그룹(EMS Overview, EMS, 화면 관리, 추천·취향)을 상세 본문에 명시했다. EMS의 Tracks·태그/시기 통계·Ingestion·멜론·공개 URL·Spotify 차트·정기 수집, 화면 관리의 메인/EMS, 추천·취향의 설계/오디오 관측을 포함했다. 일반 템플릿 메뉴를 구현 기능으로 확대하지 않았다.
- C1 PASS: 위 기능별 코드·문서 근거와 운영 화면을 대조했고, 두 사용자 제공 URL 및 제한 하이브리드·URL 수집 검증 범위를 게시 본문에서 확인했다. 상위 네 그룹은 Sidebar.tsx:43–70 및 운영 화면과 일치한다.
- C2 PASS: 최종 저장 후 수정 화면을 읽기 전용으로 다시 열어 입력한 51개 필드의 이름·값이 모두 일치함을 확인했다. 공개 상세 화면의 CDN 이미지 10장이 실제 크기로 로드되고 480×480 표지, 참여 기간·100%, 개발/디자인/기획·웹·세 분야 및 공개 게시를 재조회했다.
- C3 PASS: 공개 목록에서 총 4개를 확인했다. 기존 RESM(314478), B2B 유통 시스템(313889), Alpha Momega(312886)의 제목을 보존하고 Music Pie(318670)가 하나 추가됐다.
- 필수 검증 미확인 항목: 없음. 사용자가 열어 둔 독립 관리자 페이지에서 관리자 6장을 확보했다. 오디오 coverage와 오류 상태는 실제 화면 그대로이며, 취향 설계 화면의 제안 내용을 전부 구현 완료로 주장하지 않는다. 제품 기능 자체를 이번 게시 작업에서 다시 실행하거나 운영 데이터를 변경하지 않았다.
- 증거 디렉터리: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/wishket-music-pie/`. `submitted-fields.json`, `saved-fields-comparison.json`(51/51 일치), 최종 `published-detail.txt`, `after-public-list.txt`, `published-list.png`과 업로드 원본 10장을 저장했다.
- 다음 작업: 서비스의 실제 기능·운영 범위가 바뀌면 해당 근거 문서와 포트폴리오 원고를 함께 갱신한다.

## 핵심 기능 카드 이미지 수정

- 사용자 첨부 화면의 기본 이미지는 핵심 기능별 이미지 업로드를 누락한 결과였다. 프로젝트 상세에 등록한 10장과 핵심 기능 이미지는 별도 항목이다. 이전 검증에서 핵심 기능의 텍스트와 상세 이미지 수만 확인한 검증 범위 누락을 바로잡았다.
- 핵심 기능 5개에 EMS 트랙 탐색, GMS 추천과 액션, 오디오 분석 관측, 홈·EMS 선곡 갱신, EMS 운영 현황을 각각 등록했다. 카드가 고정 가로 비율로 이미지를 잘라 보여주므로 기존 세로 캡처 대신 실제 페이지의 가로 영역을 다시 캡처했다. 계정 연락처와 템플릿 메뉴는 포함하지 않았다.
- K1 PASS: 공개 상세에서 `/portfolio/key_features/` 이미지 5장이 각각 723×413, 723×413, 990×565, 942×538, 998×570으로 로드됐으며 기본 이미지 수는 0이다. 최종 `key-feature-fixed.png`에서 탐색·추천 카드의 제목과 실제 화면을 확인했다.
- K2 PASS: 저장 후 수정 폼의 기존 51개 필드가 51/51 일치했다. 카드별 이미지 수는 각각 1장이고 상세 이미지 10장·480×480 표지를 보존했다.
- K3 PASS: 저장 완료 후 관리 목록은 기존 세 제목과 신규 Music Pie를 포함해 총 4개였다. 동일 공개 항목 318670을 수정했다.
- 필수 미검증: 없음. 증거는 위 디렉터리의 `key-feature-image-proof.json`, `key-feature-fields-comparison.json`, `key-feature-after-list.txt`, `key-feature-fixed.png`, `kf-01-ems.png`부터 `kf-05-overview.png`까지에 기록했다.
