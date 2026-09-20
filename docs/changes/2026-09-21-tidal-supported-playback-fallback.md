# TIDAL 공식 재생 폴백 추가

## 변경 이유

브라우저 SDK 재생과 별도로 TIDAL이 제공하는 공식 Embed와 TIDAL 페이지 진입점을 제공할 필요가 있었다. 앱 큐와 셔플은 유지하면서 사용자가 TIDAL의 지원 재생 화면을 선택할 수 있게 했다.

## 변경 내용

- 전역 플레이어에 현재 트랙의 `TIDAL 전체 재생` 버튼을 추가했다.
- 검색의 앨범·플레이리스트 상세에 컬렉션 Embed 진입점을 추가했다.
- 공식 `embed.tidal.com` iframe과 `tidal.com/browse` 외부 링크를 함께 제공한다.
- TIDAL ID는 URL path segment로 인코딩한다.
- Embed를 열기 전에 기존 SDK 재생을 일시 정지해 중복 재생을 막는다.
- Embed를 닫아도 앱 큐, 현재 트랙, 셔플·반복 상태는 유지한다.

## 제약

- Embed 내부 큐와 재생 위치는 부모 앱에서 제어하지 않는다.
- 실제 재생 가능 범위와 로그인 상태는 TIDAL Embed가 결정한다.
- iframe 로드 실패를 부모 앱이 완전히 판별할 수 없어 `TIDAL에서 열기` 링크를 항상 제공한다.

## 검증

- URL 생성 테스트: 공식 Embed·browse URL과 ID 인코딩 확인
- Embed 다이얼로그 테스트: iframe, 외부 링크, 닫기 확인
- 전역 플레이어 테스트: SDK 일시 정지 후 트랙 Embed 열기 확인
- 검색 테스트: 앨범·플레이리스트 Embed URL 확인
- 전체 테스트: `46`개 파일, `147`개 테스트 통과
- ESLint 통과
- production build와 TypeScript 통과
- `git diff --check` 통과

## 미검증

- 실제 구독 계정으로 Embed 내부 재생
- 공개 도메인의 데스크톱·모바일 시각 상태
