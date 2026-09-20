# Dark Music Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Music Pie의 사용자 화면을 참조 프로젝트 기반 다크 음악 대시보드로 교체한다.

**Architecture:** 기존 Next 라우트와 `MusicSessionProvider`를 유지하며, 공통 사이드바·레이아웃 토큰과 화면별 카드/목록 스타일만 교체한다. 참조 저장소의 원격 Unsplash 이미지 URL은 표시 자산으로만 사용한다.

**Tech Stack:** Next.js, React, Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-dark-music-dashboard-design.md`

## Global Constraints

- 관리자 화면과 실제 TIDAL 인증·저장소는 수정하지 않는다.
- 공개 EMS와 개인화 GMS/MMS의 데이터 경계를 유지한다.
- 참조 프로젝트의 코드를 복사하지 않는다.

## Review Focus

- 사이드바 접힘과 모바일 메뉴에서 현재 경로가 명확해야 한다.
- 고정 플레이어가 사이드바·본문을 가리지 않아야 한다.
- 게스트의 EMS 재생과 개인화 액션 게이트가 유지되어야 한다.
- 이미지 실패 시에도 제목과 핵심 행동이 읽혀야 한다.
- 제외 트랙이 EMS 공개 카탈로그에서 사라지지 않아야 한다.

### Task 1: 다크 토큰과 반응형 셸

**Files:** `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/navigation/app-navigation.tsx`, 관련 테스트.

- [ ] 실패 테스트: 데스크톱 메뉴와 모바일 메뉴가 같은 다섯 경로를 제공하고 현재 경로를 표시한다.
- [ ] 다크 토큰, 접이식 사이드바, 모바일 하단 메뉴, 콘텐츠 안전 여백을 구현한다.
- [ ] `npm run test -- --run src/app/layout.test.tsx`와 `npm run lint`를 실행한다.
- [ ] `git commit -m "feat(ui): replace shell with dark dashboard"`.

### Task 2: 이미지 중심 홈과 EMS

**Files:** `apps/web/src/app/page.tsx`, `apps/web/src/components/music/*`, `apps/web/src/components/ems/*`, `apps/web/src/app/ems/page.tsx`, `apps/web/src/app/search/page.tsx`, 관련 테스트.

- [ ] 실패 테스트: 게스트에게 이미지 히어로·공개 탐색·검색 결과를 제공한다.
- [ ] 참조 이미지 URL을 홈/카드 배경으로 사용하고, EMS 검색·빈 상태·재생을 다크 카드로 구성한다.
- [ ] `npm run test`와 `npm run lint`를 실행한다.
- [ ] `git commit -m "feat(ui): add dark discovery and catalog views"`.

### Task 3: GMS, MMS, 플레이어 및 전체 검증

**Files:** `apps/web/src/app/gms/page.tsx`, `apps/web/src/app/mms/page.tsx`, `apps/web/src/components/player/*`, 관련 테스트, 변경 기록.

- [ ] 실패 테스트: 게스트 개인화 게이트, 제외 영향 범위, 플레이어 다이얼로그를 검증한다.
- [ ] GMS 카드, MMS 트랙 목록, 하단 반투명 플레이어를 대시보드 언어로 교체한다.
- [ ] `npm run test`, `npm run lint`, `npm run build`를 실행하고 변경 기록을 남긴다.
- [ ] `git commit -m "feat(ui): complete dark music dashboard"`.
