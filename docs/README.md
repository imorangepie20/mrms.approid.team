# music-pie 문서 인덱스

프로젝트 문서를 목적별로 찾는 시작 페이지입니다. 새 작업을 시작할 때는 먼저 현재 상태와 프로젝트 원칙을 확인합니다.

## 가장 먼저 읽기

| 목적 | 문서 |
| --- | --- |
| 프로젝트가 무엇인지 확인 | [프로젝트 개요](overview/project-brief.md) |
| 현재 구현·배포·미검증 상태 확인 | [현재 개발 맥락](overview/current-development-context.md) |
| 작업 경계와 도메인 원칙 확인 | [핵심 원칙](project-rules/core-principles.md) |
| 문서를 읽는 순서 확인 | [문서 접근 순서](project-rules/doc-access-order.md) |
| 운영 명령과 EMS 상태 확인 | [EMS 카탈로그 운영 런북](runbooks/ems-catalog-ingestion.md) |

## 기능별 빠른 이동

### 개인화 추천·GMS

- [개인화 추천 초기 전략](decisions/2026-09-20-personalized-recommendation-baseline.md)
- [트랙 임베딩·취향 프로필 설계](superpowers/specs/2026-09-22-track-embedding-taste-profile-design.md)
- [GMS 개인화 추천 구현 계획](superpowers/plans/2026-09-22-gms-personalized-recommendations.md)
- [GMS 개인화 추천 변경 기록](changes/2026-09-22-gms-personalized-recommendations.md)
- [사용자 경험 스토리보드](superpowers/specs/2026-09-20-user-experience-storyboard-design.md)

### EMS 카탈로그·에디토리얼

- [EMS 관리자 수집 계획](plans/2026-09-24-admin-ems-fill.md)
- [EMS 관리자 수집 변경 기록](changes/2026-09-24-admin-ems-ingestion.md)
- [메인·EMS 화면 독립 관리 계획](plans/2026-09-24-independent-screen-management.md)
- [메인·EMS 화면 독립 관리 변경 기록](changes/2026-09-24-independent-screen-management.md)
- [EMS 카탈로그 설계](superpowers/specs/2026-09-22-ems-catalog-ingestion-design.md)
- [EMS 카탈로그 구현 계획](superpowers/plans/2026-09-22-ems-catalog-ingestion.md)
- [EMS 카탈로그 변경 기록](changes/2026-09-22-ems-catalog-ingestion.md)
- [Home·EMS 에디토리얼 섹션 설계](superpowers/specs/2026-09-22-ems-editorial-sections-design.md)
- [Home·EMS 에디토리얼 섹션 구현 계획](superpowers/plans/2026-09-22-home-ems-editorial-sections.md)
- [Home·EMS 에디토리얼 섹션 변경 기록](changes/2026-09-22-ems-editorial-sections.md)

### TIDAL 연결·라이브러리·재생

- [Auth0·TIDAL 인증 설계](superpowers/specs/2026-09-20-auth0-tidal-authentication-design.md)
- [TIDAL 플레이리스트 저장 설계](superpowers/specs/2026-09-20-tidal-playlist-persistence-design.md)
- [TIDAL 전체 재생 구현](deployment/tidal-full-playback-implementation.md)
- [MMS 저장 라이브러리 변경 기록](changes/2026-09-21-mms-saved-library.md)
- [TIDAL 카탈로그 상세 변경 기록](changes/2026-09-21-tidal-catalog-details.md)

### 배포·운영

- [Zorin 운영 배포 설계](superpowers/specs/2026-09-22-zorin-production-deployment-design.md)
- [Zorin 운영 배포 계획](superpowers/plans/2026-09-22-zorin-production-deployment.md)
- [Zorin 운영 배포 변경 기록](changes/2026-09-22-zorin-production-deployment.md)
- [Auth0·TIDAL·Cloudflare 설정](deployment/auth0-tidal-cloudflare-setup.md)
- [프로젝트 하네스](harness/portable-project-harness.md)
- [스킬·플러그인 환경](harness/skill-plugin-environment.md)

## 문서 종류별 전체 보기

- [결정 기록](decisions/)
- [변경 기록](changes/)
- [배포 문서](deployment/)
- [운영 런북](runbooks/)
- [작업 계획](plans/)
- [상세 설계·실행 계획](superpowers/)
- [프로젝트 규칙](project-rules/)
- [개요 문서](overview/)

## 문서 작성 규칙

- 문서는 한국어로 작성하고 경로·명령·식별자는 원문을 유지합니다.
- 변경 이유, 변경 내용, 검증 결과, 미검증 항목, 다음 작업을 기록합니다.
- 실제로 성공한 명령만 검증 완료로 기록합니다.
- 비밀값·쿠키·캐시·DB dump는 문서와 저장소에 기록하지 않습니다.
- 사용자 작업으로 보이는 미추적 파일은 임의로 수정하거나 커밋하지 않습니다.

## 최근 주요 변경

- [2026-09-23 트랙 카드 레일 스크롤·모션 개선](changes/2026-09-23-track-rail-motion.md)
- [2026-09-23 사용자 취향 분석 완료](changes/2026-09-23-taste-profile-completion.md)
- [2026-09-23 온보딩 화면 시각 개선](changes/2026-09-23-onboarding-visual-refresh.md)
- [2026-09-23 GMS 빈 상태 시각 개선](changes/2026-09-23-gms-empty-state-visual-refresh.md)
- [2026-09-22 GMS 개인화 추천 연결](changes/2026-09-22-gms-personalized-recommendations.md)
- [2026-09-22 트랙 임베딩·취향 프로필](changes/2026-09-22-track-embedding-taste-profile.md)
- [2026-09-22 EMS 에디토리얼 섹션](changes/2026-09-22-ems-editorial-sections.md)
- [2026-09-22 EMS 카탈로그 수집](changes/2026-09-22-ems-catalog-ingestion.md)
- [2026-09-22 최초 취향 분석 기준](changes/2026-09-22-taste-readiness-thresholds.md)
