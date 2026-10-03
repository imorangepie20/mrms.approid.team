# GMS 추천 그룹 통합 UI·UX 계획

## 요청과 근거

별도 추천 이력 진입을 제거하고 GMS에서 현재·지난 추천의 모든 표시 가능한 트랙을 회차별로 표시한다. 트랙 제거·그룹 전체 제거와 페이지/플레이어 하트 상태 연동을 제공한다. 기존 batch snapshot·exposure·결정·MMS는 보존한다 (`gms-recommendation-batches.ts`, `recommendation-history-list.tsx`, `LikesProvider`, `trackLikeItem`). 제거는 싫어요 결정과 구분되는 사용자별 표시 숨김이다.

## 변경·의존 순서

1. 034 그룹 숨김 tombstone migration과 사용자 소유권을 검증하는 단일 SQL 삭제를 추가한다. 숨긴 current batch는 자동 재생성하지 않으며 명시적 새 추천만 회전한다.
2. 모든 숨기지 않은 batch 조회와 현재 목록의 트랙 숨김 필터를 연결하고 DELETE API에 그룹 요청을 추가한다.
3. `/gms`에서 전체 그룹을 조회한다. 기존 `/gms/history`는 `/gms`로 이동시킨다.
4. 기존 목록·확인창을 재사용하여 개별/선택/그룹 제거와 그룹 내 결정 작업을 제공한다. 수락·거절 결과도 그룹에 남아 상태를 표시한다. 모든 하트는 같은 `LikesProvider`와 TIDAL ID를 사용한다.
5. 회귀·DB 검증·lint/build·desktop/mobile UI를 확인하고 변경 기록을 작성한다.

## 객관적 완료 체크 (최종 첫 검증 pass의 단위)

1. 통합 조회·접근 경계: 전체 회차 조회(24개 초과 포함), 최신순, 숨김 제외, 비회원/연결 미완료 조회 차단, history redirect 회귀 통과.
2. 제거·결정 UI: 개별/선택/그룹 확인 취소, 성공/실패/재시도/중복 차단, 빈 그룹 삭제, 수락·거절 상태와 기존 MMS 알림 회귀 통과.
3. 저장 경계: 격리 PostgreSQL에서 034 apply/down/reapply, 소유권·멱등·현재 추천 숨김·원본/exposure/결정 보존 검증 통과.
4. 좋아요: 동일 TIDAL 트랙의 그룹 목록·컴팩트/전체 플레이어 좋아요와 pending·실패 복원 연동 회귀 통과.
5. 품질: 관련 회귀, Web lint·production build, `git diff --check` exit 0 및 범위 diff 검토.
6. 접근성·반응형: 실제 컴포넌트 desktop/390×844 렌더, 가로 넘침 없음, 제거 버튼·키보드 확인창 동작과 screenshot 증거.

운영 배포·실사용자 데이터 변경은 이번 로컬 구현 검증 범위에 포함하지 않는다. 조건부 테스트 skip과 운영 미검증은 별도로 기록한다.

## 결과

완료 체크 1–6 PASS. 최종 전체 Web 610개 통과·기존 조건부 6개 skip, 이번 GMS 격리 PostgreSQL 3개 통과·skip 0, lint 오류 0·기존 경고 8, TypeScript/production build·diff check exit 0. desktop/390×844 overflow·44px 버튼·확인창 keyboard/취소와 screenshot을 확인했다. 로컬 구현이며 운영 migration·배포는 수행하지 않았다. 세부 증거와 미검증 항목은 [변경 기록](../changes/2026-10-04-gms-grouped-recommendations.md)에 있다.
