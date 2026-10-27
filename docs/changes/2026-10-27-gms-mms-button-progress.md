# GMS +MMS 버튼 진행 표시

## 이유

GMS 추천 트랙에서 `+ MMS`를 누르면 저장 요청이 끝날 때까지 버튼 모양이 그대로라 눌렸는지 알 수 없었다.

## 변경

- `apps/web/src/components/dashboard/music-dashboard.tsx`: 저장 중인 결정(`pendingDecision`: 트랙 ID·accept/reject)을 상태로 두고 `Gateway` → `RecommendationHistoryList`로 넘긴다.
- `apps/web/src/components/recommendations/recommendation-history-list.tsx`: 누른 트랙의 `+ MMS` 버튼을 저장 중에는 회전 아이콘만 보이게 바꾸고(숨긴 `+ MMS` 라벨로 버튼 폭 유지) `aria-busy="true"`, 접근 이름 `MMS에 추가 중`, disabled로 표시한다. 성공하면 기존처럼 `MMS로 보냄` 상태가 되고, 실패하면 `+ MMS`로 돌아온다.
- `apps/web/src/app/styles/dashboard.css`: `.gms-decision-button--pending`, `.gms-decision-spinner`를 추가했다. `prefers-reduced-motion: reduce`에서는 회전하지 않는다.

## 검증

- 새 테스트 2개(`gms-functional-review.test.tsx`: 저장 중 표시·성공 후 해제, 실패 후 복구)가 변경 전 실패, 변경 후 통과
- `npx vitest run src/components/dashboard src/components/recommendations`: 3 파일 41개 통과
- `npx tsc --noEmit`, 변경 파일 eslint 통과

## 미검증

- 브라우저에서 실제 모양·모바일 폭 확인과 배포는 하지 않았다.
