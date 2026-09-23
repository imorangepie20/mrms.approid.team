# GMS 빈 상태 시각 개선

## 변경 이유

취향 분석 전·추천 후보 소진·추천 API 오류 상태가 일반 텍스트 박스로만 보여 현재 상태와 다음 행동을 빠르게 파악하기 어려웠다.

## 변경 내용

- 프로필 미완료·후보 소진·오류 상태를 GMS 전용 패널로 분리했다.
- 상태별 제목, 보조 설명, 다음 행동 CTA를 추가했다.
- 바이닐 오비트 장식과 상태별 색조를 사용해 GMS의 음악적 맥락을 유지했다.
- 모바일에서는 오비트와 설명을 세로로 재배치했다.
- 추천 데이터·결정 저장·인증 경계는 변경하지 않았다.
- 카드 재생 버튼의 텍스트 기호를 스타일 아이콘으로 교체하고 안내 아이콘을 CSS로 그려 시각 언어를 통일했다.

## 검증 결과

- `npm test -- --run src/components/dashboard/music-dashboard.test.tsx src/components/onboarding/tidal-onboarding.test.tsx src/app/onboarding/page.test.tsx` 통과 (3 files, 25 tests)
- 변경 대상 ESLint 통과
- Impeccable detector 통과 (`[]`)
- `git diff --check` 통과 (기존 사용자 변경 파일의 줄바꿈 경고만 표시)

## 미검증 항목

- 로컬 개발 서버는 Auth0 환경변수 미설정으로 실제 픽셀 캡처를 완료하지 못했다.
- completed taste profile이 없는 운영 계정이라 실제 추천 카드 상태는 아직 확인하지 못했다.
