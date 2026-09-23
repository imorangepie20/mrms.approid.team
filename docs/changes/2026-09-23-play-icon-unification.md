# 플레이 아이콘 통일

- 날짜·작업명: 2026-09-23 플레이 아이콘 통일
- 변경 이유: GMS 추천 카드와 일반 트랙 카드가 서로 다른 CSS 삼각형·SVG 아이콘을 사용해 재생 컨트롤의 모양과 크기가 일관되지 않았다.
- 변경 내용:
  - 공통 `PlayIcon` SVG 컴포넌트를 추가했다.
  - GMS 추천 카드와 `TrackCard`가 같은 아이콘 구조와 16px 시각 크기를 사용하도록 통일했다.
  - 기존 CSS border 삼각형을 제거하고 SVG `currentColor`로 색상을 상속하게 했다.
  - 재생 버튼의 aria-label과 클릭 동작은 변경하지 않았다.
- 검증:
  - 관련 Vitest 2개 파일·10개 테스트 통과
  - 전체 Vitest 84개 파일·339개 테스트 통과
  - 변경 파일 ESLint 통과
  - `npm run build` 성공
  - Impeccable detector 지적 0건
  - `git diff --check` 성공
- 미검증·제약:
  - 운영 브라우저에서 hover/focus의 실제 시각 감각은 배포 후 확인이 필요하다.
