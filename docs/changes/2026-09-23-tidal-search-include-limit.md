# TIDAL 검색 include 제한 수정

## 변경 이유

실제 운영 계정에서 `annette` 검색 시 TIDAL v2가 `400 VALUE_TOO_HIGH`와 함께 `Include count 12 exceeds limit 10`을 반환했다. 검색 UI는 이 응답을 일반 검색 실패로 표시했다.

## 변경 내용

- 검색 `include` 목록에서 트랙 앨범 커버의 중복 중첩 관계를 제거했다.
- 앨범 자체의 `albums.coverArt` 관계로 트랙 앨범 아트워크를 계속 조인한다.
- 요청 관계 수를 TIDAL 제한인 10개로 고정하는 회귀 검증을 추가했다.

## 검증 결과

- 실제 운영 토큰·`annette` 요청: TIDAL HTTP 200
- 검색 focused Vitest 17개 통과
- 전체 Vitest 84개 파일·341개 테스트, lint 오류 0(기존 경고 3), build·TypeScript 통과

## 미검증 항목

- 로그인된 Chrome 화면에서 결과 카드가 표시되는 최종 픽셀 검증은 배포 후 확인한다.
