# 통합 취향 분석 문서와 관리자 화면 연결 계획

## 목표

현재 운영 중인 TIDAL 플레이리스트·트랙 메타데이터·좋아요·GMS 결정 기반 취향 분석과 30초 프리뷰 오디오 분석 확장안을 하나의 기준 문서로 통합한다. 관리자가 같은 내용을 `/admin/taste-analysis`에서 읽을 수 있도록 전용 라우트와 사이드바 진입점을 추가한다.

## 변경 파일과 순서

1. `docs/overview/taste-analysis-system.md`
   - 현재 입력·임베딩·가중치·군집·GMS 점수화의 실제 구현을 기록한다.
   - 30초 프리뷰의 구간 분할, 오디오 지표, 임베딩, 텍스트·오디오 결합안과 처리 자원을 기록한다.
   - 현재 동작과 제안 상태를 명확히 구분한다.
2. `apps/admin/src/pages/TasteAnalysis.tsx`
   - 기준 문서의 운영 요약을 관리자 디자인 토큰으로 구성한다.
   - 데이터 흐름, 현재 신호, 오디오 지표, 결합 점수, 단계별 도입 순서를 반응형 카드·표로 표시한다.
3. `apps/admin/src/App.tsx`, `apps/admin/src/components/layout/Sidebar.tsx`
   - `/admin/taste-analysis` 라우트와 `추천·취향` 메뉴를 연결한다.
4. `apps/admin/src/pages/TasteAnalysis.test.ts`
   - 라우트, 메뉴, 핵심 문서 섹션이 소스에 연결됐는지 회귀 검증한다.
5. `docs/changes/2026-09-29-taste-analysis-admin-document.md`, `docs/overview/current-development-context.md`
   - 실제 변경과 검증 결과, 미구현 범위를 기록한다.

## 구현 경계

- 이번 변경은 설계 문서와 관리자 열람 화면만 추가한다.
- 프리뷰 수집, 오디오 디코딩, 오디오 모델, DB migration, 취향 프로필 산식 변경은 구현하지 않는다.
- 관리자 화면은 운영 상태를 조작하지 않는 읽기 전용 문서다.
- 현재 구현과 제안 수치를 섞지 않고 상태 배지로 구분한다.

## 검증

1. `apps/admin`: 관련 Vitest 및 전체 `npm test`
2. `apps/admin`: `npm run lint`
3. `apps/admin`: `npm run build`
4. `apps/web`: `npm run build`로 관리자 자산 포함 확인
5. 저장소 루트: `git diff --check`

## 완료 기준

- 저장소에 통합 취향 분석 기준 문서가 존재한다.
- 관리자 사이드바에서 취향 분석 문서 화면으로 이동할 수 있다.
- 현재 분석과 30초 오디오 분석 제안이 구분되어 표시된다.
- 모바일·데스크톱에서 가로 넘침 없이 읽을 수 있는 구조다.
- 실제 성공한 검증과 미구현 항목이 변경 기록에 남는다.
