# 최초 취향 분석 시작 조건 표시 계획

- 목표: TIDAL 플레이리스트 선택 중 예상 트랙 수와 분석 준비 상태를 보여주고, 가져오기 후 고유 트랙이 15곡 미만이면 첫 추천 준비를 완료하지 않는다.
- 기준: 최소 15곡, 권장 30곡, 다중 취향 분석 안내 60곡.
- 변경 범위:
  - `apps/web/src/components/onboarding/tidal-onboarding.tsx`: 선택 예상치와 상태 문구, 완료 후 최소 조건 처리.
  - `apps/web/src/lib/db/music-library.ts`: 사용자별 고유 저장 트랙 수를 가져오기 상태에 포함.
  - `apps/web/src/lib/tidal/client-api.ts`: 가져오기 상태 타입 확장.
  - 관련 단위 테스트.
- 검증: 관련 Vitest를 실패 상태에서 확인한 뒤 구현하고, 전체 `npm test`, `npm run lint`, `npm run build`를 실행한다.
- 제외: 임베딩 생성, 취향 군집 생성, 추천 점수 계산.
