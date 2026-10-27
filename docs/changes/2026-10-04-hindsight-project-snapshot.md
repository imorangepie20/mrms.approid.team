# Music Pie 프로젝트 등록 스냅샷

기준일: 2026-10-04. 문서와 사용자 확인에 근거한 프로젝트 기록이며, 아래 운영 상태는 해당 문서의 확인 시점 기준이다.

## 1. 식별과 목적

- 프로젝트: Music Pie (`music-pie`). 작업 경로: `C:/Wspace/music-pie`.
- 목적: 사용자가 허용한 TIDAL 플레이리스트를 받아 음악 취향을 분석하고 개인화된 음악을 추천한다.
- 서비스: https://mrms.approid.team/
- 저장소: https://github.com/imorangepie20/mrms.approid.team
- 참여: 2026.09~2026.10, 참여율 100% 개인 프로젝트(사용자 확인), 운영 및 개선 중.
- 공개 포트폴리오: https://www.wishket.com/partners/p/mibeen/portfolio/318670
- 근거: `docs/overview/project-brief.md`, `docs/changes/2026-10-04-wishket-portfolio-content.md`.

## 2. 사용자 기능

EMS는 외부 음악 카탈로그, GMS는 개인화 추천, MMS는 개인 음악 공간이다. 홈 발견 콘텐츠, 통합 음악 검색과 트랙·앨범·아티스트·플레이리스트 상세, Auth0 회원/관리자 인증, TIDAL OAuth 및 별도 Device Code 재생 연결, 선택 플레이리스트 가져오기와 진행 표시를 구현했다. 전역 FULL 플레이어는 HTMLAudioElement와 hls.js를 사용하며 큐·이전/다음·셔플·반복·seek·볼륨을 제공한다. MMS는 가져온 플레이리스트, 네 유형의 좋아요, 내부 플레이리스트 CRUD·순서 변경, 수락한 추천을 제공한다. 추천 수락과 좋아요는 별개다.

근거: `docs/overview/current-development-context.md`, `docs/deployment/tidal-full-playback-implementation.md`, `apps/web/src/app/mms/page.tsx`.

## 3. 추천과 취향 분석

텍스트 취향 분석은 Sentence Transformers `paraphrase-multilingual-mpnet-base-v2`의 768차원 L2 정규화 벡터, 가중 프로필과 군집을 사용한다. 사용자 자신의 플레이리스트와 추천 액션으로만 개인 모델을 갱신한다. GMS는 유사도·신뢰도·발매 최근성·다양성 등을 반영하고 수락·스킵·싫어요를 기록한다. 싫어요 트랙은 해당 사용자의 향후 추천에서 영구 제외되며 다른 사용자와 EMS 원본에는 영향을 주지 않는다.

이미 제공된 트랙은 액션이 없어도 사용자별 exposure로 중복 추천을 막는다. 단순 새로고침은 current batch를 유지하고 명시적 다시 추천 요청이 새 batch를 만든다. 추천 이력에는 개별/전체 체크박스와 선택 삭제가 있으며, 이력 숨김은 원본 snapshot·노출·결정 기록을 보존한다. +MMS 수락 후 MMS에 영속 반영하고 성공 알림·삭제 확인창은 HUD 템플릿 커스텀 UI를 재사용한다.

오디오 분석은 별도 Python 서비스에서 최대 30초 preview를 FFmpeg로 검증·디코딩하고 Essentia DSP, MAEST, MusiCNN, ONNX Runtime 등을 사용한다. 하이브리드 추천은 허용된 사용자와 필요한 component의 완전 coverage에서만 활성화하며 미달하면 텍스트 baseline으로 fallback한다. 전 사용자 또는 전체 카탈로그에 오디오 분석이 완료됐다고 해석하지 않는다.

근거: `docs/overview/taste-analysis-system.md`, `docs/changes/2026-09-29-gms-permanent-recommendation-history.md`, `docs/changes/2026-10-03-gms-history-selection.md`, `docs/changes/2026-09-29-hybrid-full-coverage-activation.md`.

## 4. EMS 수집과 운영 관리자

EMS는 TIDAL ID·ISRC 중복 검사, KR STREAM 가능 여부와 품질 검사, MusicBrainz 메타데이터·장르 보강, 임베딩과 출처 관리를 수행한다. 멜론은 5곡 단위로 8장르를 순환하며 장르별 독립 cursor를 유지한다. Spotify 공개 차트 후보를 TIDAL 카탈로그와 매칭한다. 수집 작업은 상태·heartbeat·재시도·시간 및 자원 예산·lease를 관리한다.

사용 중인 관리자 상위 네 그룹은 EMS Overview, EMS, 화면 관리, 추천·취향이다. 운영/품질 통계, 트랙·수집·멜론·공개 URL·Spotify·정기 작업, 홈/EMS 콘텐츠 관리, 취향 설계와 오디오 관측을 포함한다. 일반 HUD 템플릿의 나머지 샘플 메뉴를 Music Pie 구현 기능으로 간주하지 않는다.

홈과 EMS는 별도 선곡 설정을 사용한다. 관리자 기준 설정 → 비동기 미리보기 → 변경 비교 → 커스텀 확인 → transaction 적용 흐름으로 갱신한다. 현재 노출 밖의 적격 트랙을 우선하고 후보가 부족하면 기존 트랙으로 채운다. GMS의 영구 노출 제외와 이 편집 선곡 정책은 서로 다르다.

근거: `apps/admin/src/components/layout/Sidebar.tsx`, `docs/changes/2026-10-03-melon-five-track-round-robin.md`, `docs/changes/2026-10-03-admin-editorial-refresh.md`, `docs/changes/2026-10-03-editorial-refresh-variety.md`.

## 5. 실제 구현 스택과 배포 기준

사용자 Web: Next.js 16, React 19, TypeScript, Tailwind CSS, Auth0, hls.js. 관리자: React 18, Vite, HUD, Headless UI. 분석/수집: Python, FastAPI, PyTorch, Sentence Transformers, Essentia, ONNX Runtime, FFmpeg. DB: PostgreSQL과 pgvector. 운영: Zorin Linux, Docker Compose, Cloudflare Tunnel.

2026-10-03 현재 개발 상태 문서의 최신 기능 커밋은 `3cd1ea3`이며 Web/EMS 배포는 `20261003-editorial-variety-3cd1ea3`, audio-analysis 기준 커밋은 `db8c230`이다. 2026-10-04 등록 시 로컬 HEAD는 문서 기록 커밋 `692a442f352676538919c32be8cfab3fb6a397b5`이다. 초기 제안의 Spring/Tomcat·CLAP·TIDAL Player SDK를 실제 구현 스택으로 옮기지 않는다.

근거: `docs/overview/current-development-context.md`, `docs/changes/2026-10-04-wishket-portfolio-content.md`, 등록 시 `git log -1`.

## 6. 최근 검증과 외부 공개 작업

2026-10-03 편집 선곡 다양성 변경 기록에는 Python 116개, 관련 Web 41개, 관리자 13개, 격리 PostgreSQL 통합 검증 11개와 lint/type/build 성공이 기록돼 있다. 실제 운영 비교에서 홈 36곡 중 29곡, EMS 60곡 중 52곡의 교체와 미리보기/적용 순서 일치를 확인했다. 이 수치는 당시 기록이며 이번 Hindsight 등록에서 제품 테스트나 배포를 재실행한 결과가 아니다.

2026-10-04 위시켓에는 기존 세 포트폴리오를 보존하고 Music Pie를 추가했다. 본문 4,190자, 상세 이미지 10장·표지, 핵심 기능 5개와 별도 카드 이미지 5장의 저장 및 공개 로딩을 검증했다. 프로젝트 소개는 확인된 구현과 제한을 구분한다.

근거: `docs/changes/2026-10-03-editorial-refresh-variety.md`, `docs/changes/2026-10-04-wishket-portfolio-content.md`.

## 7. 경계와 확인되지 않은 사항

재생은 TIDAL 계정·구독·지역·실제 권한의 영향을 받는다. 공개 URL 검토·승인 기능의 구현을 모든 실제 URL 수집 성공으로 확대하지 않는다. 취향 설계 화면의 확장 제안을 전부 구현 완료로 주장하지 않는다. 추천 정확도 향상률, 매출, 상업 고객, 전체 사용자 하이브리드 적용은 검증된 사실이 아니다. 오디오 원본과 서명 URL을 영구 분석 데이터로 보관하지 않는다.

다른 프로젝트의 코드·DB·계정·배포 대상·비밀값은 혼용하지 않는다. Hindsight에는 프로젝트 정보만 저장하고 토큰·쿠키·DB dump·개인 이력서는 포함하지 않는다.

근거: `docs/project-rules/core-principles.md`, `docs/changes/2026-10-04-wishket-portfolio-content.md`.

## 8. 후속 작업 절차

작업 전 `docs/README.md` → `docs/project-rules/core-principles.md` → `docs/project-rules/doc-access-order.md` → `docs/overview/current-development-context.md` → `docs/overview/project-brief.md`를 읽는다. 초기 기획보다 확인된 구현·최신 변경 기록을 우선한다. 한국어 계획·변경 기록을 작성하고 요청 범위 밖 변경과 사용자 변경을 보존한다.

모든 작업 단위에 사전 객관적 검증 1~10개를 정의하고 최종 PASS/FAIL/UNVERIFIED와 근거를 보고한다. 첫 전체 검증에서 비통과가 세 개 이상이면 개별 증상 수정을 중단하고 최초 실패 계층을 보고한다. 필수 미검증을 완료로 간주하지 않는다. 기능 변경 후 실제로 성공한 검증만 기록한다.

근거: `AGENTS.md`, 이 대화에서 사용자가 제공한 Work-unit completion gate.
