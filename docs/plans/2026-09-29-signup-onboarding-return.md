# 회원가입 뒤 TIDAL 온보딩 복귀 수정 계획

## 문제

- 메인의 `회원가입` 진입점은 Auth0 가입 화면만 요청하고 가입 완료 뒤 목적지인 `returnTo`를 전달하지 않는다.
- 일반 회원 Auth0 콜백은 TIDAL 연결 확인 화면을 반드시 거치지만, 목적지가 없으면 `/tidal-connection?returnTo=/`로 이동한다.
- 신규 사용자가 TIDAL Device 승인을 완료해도 홈으로 돌아가므로 `/onboarding?tidal=connected`에서 열리는 플레이리스트 선택 단계에 도달하지 못한다.
- 이미 TIDAL이 연결된 확인 화면의 `플레이리스트 가져오기` 링크도 `/onboarding`만 가리켜 연결 완료 상태를 명시하지 않는다.

## 변경 범위

1. 익명 사용자용 `회원가입` 링크에 `returnTo=/onboarding?tidal=connected`를 전달한다.
2. 기존 `/api/auth/signup` 호환 redirect도 같은 가입 진입점과 `returnTo`를 사용한다.
3. TIDAL 연결 확인 화면의 `플레이리스트 가져오기` 링크를 `/onboarding?tidal=connected`로 통일한다.
4. `AuthControls`, 루트 레이아웃, legacy signup route, 연결 완료 화면의 회귀 테스트를 먼저 실패시키고 최소 구현으로 통과시킨다.

## 보존 조건

- 일반 `로그인` 링크와 관리자 로그인·콜백 복귀 동작은 변경하지 않는다.
- Auth0 콜백과 TIDAL 연결 확인 화면의 same-origin `returnTo` 검증을 유지한다.
- TIDAL 연결 상태, 토큰, 플레이리스트 데이터 모델은 변경하지 않는다.

## 완료 기준

- 회원가입 완료 뒤 TIDAL 연결 확인 화면을 거쳐 Device 승인 성공 시 `/onboarding?tidal=connected`로 복귀한다.
- 연결이 이미 완료된 사용자의 `플레이리스트 가져오기`도 같은 URL로 이동한다.
- 관련 회귀 테스트가 수정 전 실패하고 수정 후 통과한다.
- 전체 회귀·lint·production build와 운영 배포는 후속 검증 단계에서 수행한다.
