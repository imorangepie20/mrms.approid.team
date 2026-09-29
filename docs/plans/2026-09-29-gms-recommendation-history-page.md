# GMS 사용자 추천 트랙 이력 페이지 계획

## 목표

- `/gms/history`에서 로그인한 사용자의 추천 batch와 당시 추천 트랙을 최신순으로 확인할 수 있게 한다.
- 현재 batch, 교체된 batch, 후보 소진 상태를 구분하고 트랙별 추천 결정 상태를 함께 표시한다.
- 한 번 추천한 트랙을 다시 추천하지 않는 기존 노출 이력과 사용자 격리 규칙은 변경하지 않는다.

## 변경 범위와 순서

1. `gms-recommendation-batches` 조회 계층에 사용자별 이력 페이지네이션과 최신 결정 상태 결합을 추가한다.
2. `/gms/history` 서버 페이지와 재생 가능한 이력 목록 UI를 추가한다.
3. 기존 GMS의 접이식 최근 이력은 제거하고 독립 이력 페이지 링크로 교체한다.
4. 저장소 조회, 접근 경계, 페이지 렌더링, 재생 동작을 테스트한다.
5. 관련 변경 기록을 남긴다.

## 데이터·권한 규칙

- `app_users.auth0_subject`를 기준으로 batch와 결정 이력을 모두 사용자 범위로 제한한다.
- batch snapshot은 수정하지 않고 표시용으로만 읽는다.
- 같은 트랙의 결정이 여러 번 있으면 가장 최근 결정을 표시한다.
- 페이지 크기는 10개 batch로 제한하고 잘못된 page 값은 1로 정규화한다.
- 비로그인, DB 미설정, TIDAL 미연결 상태에서는 개인 추천 이력을 조회하지 않는다.

## 완료 기준

- GMS에서 추천 이력 페이지로 이동할 수 있다.
- 이력 페이지에서 batch 상태, 생성 시각, 트랙, 결정 상태가 사용자별로 표시된다.
- 이력 트랙을 누르면 현재 페이지에 표시된 이력 트랙 전체가 재생 대기열로 설정된다.
- 이전/다음 페이지 이동이 동작한다.
- 단위·컴포넌트 테스트, lint, production build가 성공한다.

## 검증 명령

- `npm test -- --run src/lib/db/gms-recommendation-batches.test.ts src/app/gms/page.test.tsx src/app/gms/history/page.test.tsx src/components/dashboard/music-dashboard.test.tsx src/components/recommendations/recommendation-history-list.test.tsx`
- `npm run lint`
- `npm run build`

