# 온보딩 화면 시각 개선

## 변경 이유

온보딩 화면이 어두운 패널과 단순한 체크박스 중심으로 보여 음악 서비스의 분위기와 현재 단계를 빠르게 파악하기 어려웠다.

## 변경 내용

- 온보딩 소개 영역에 앨범 카드와 바이닐 장식, 오로라 배경을 추가했다.
- TIDAL 연결·플레이리스트 선택·취향 분석의 현재 단계를 진행 rail로 표시했다.
- 선택된 플레이리스트에 강조 테두리·체크 상태·트랙 수 강조를 적용했다.
- 예상 트랙 수를 크게 표시하고 모바일에서 진행 rail과 장식이 넘치지 않도록 반응형 규칙을 추가했다.
- 선택된 플레이리스트 수를 보여주는 sticky 행동 영역을 추가해 긴 목록에서도 `MMS 만들기`를 놓치지 않게 했다.
- 기존 가져오기·분석 로직과 문구 의미, 토큰 체계는 유지했다.

## 검증 결과

- `npm test -- --run src/app/onboarding/page.test.tsx src/components/onboarding/tidal-onboarding.test.tsx` 통과 (2 files, 16 tests)
- `npx eslint src/app/onboarding/page.tsx src/components/onboarding/tidal-onboarding.tsx src/components/onboarding/tidal-onboarding.test.tsx src/app/onboarding/page.test.tsx` 통과
- Impeccable detector 통과 (`[]`)
- `git diff --check` 통과 (기존 사용자 변경 파일의 줄바꿈 경고만 표시)

## 미검증 항목

- 로컬 Next.js 개발 서버는 Auth0 환경변수 미설정으로 `DomainResolutionError` 오버레이가 표시되어 브라우저 픽셀 검증을 완료하지 못했다.
- 웹 전체 테스트 명령은 기존 장시간 실행 구간에서 완료 신호를 받지 못해 중단했으며, 변경 영향 범위의 온보딩 테스트만 통과를 확인했다.

## 다음 작업

- 배포 환경 또는 Auth0 개발 환경에서 데스크톱·모바일 실제 캡처를 확인한다.
