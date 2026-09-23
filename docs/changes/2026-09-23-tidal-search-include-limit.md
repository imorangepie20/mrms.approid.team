# TIDAL 검색 include 제한 수정

## 변경 이유

실제 운영 계정에서 `annette` 검색 시 TIDAL v2가 `400 VALUE_TOO_HIGH`와 함께 `Include count 12 exceeds limit 10`을 반환했다. 검색 UI는 이 응답을 일반 검색 실패로 표시했다.

## 변경 내용

- 통합 결과에 필요한 `topHits` 관계를 유지했다.
- 아티스트 카드에 필요한 `artists.profileArt` 관계를 유지했다.
- 검색 `include` 목록에서 트랙 앨범 커버의 중복 중첩 관계를 제거했다.
- `albums.artists` 관계를 제외하고 `albums.coverArt`·`artists.profileArt`를 유지해 카드 아트워크를 보존한다.
- 앨범 아티스트 관계가 생략된 응답에서는 트랙의 아티스트 관계를 앨범 카드에 fallback으로 사용한다.
- 요청 관계 수를 TIDAL 제한인 10개로 고정하는 회귀 검증을 추가했다.

초기 10개 수정에서 `topHits`와 `artists.profileArt`를 차례로 제외해 통합 결과와 아티스트 카드 아트워크가 비는 회귀가 발생했다. 최종 수정은 `topHits`·`artists.profileArt`를 복구하고 선택적인 `albums.artists`만 제외하는 방식으로 제한을 맞췄다.

같은 검색 흐름에서 카탈로그 본문이 실패하면 제시어 응답까지 버려지던 문제도 수정했다. 제시어는 독립적으로 반영하고, 본문 실패 시에도 입력창 아래에 표시한다.

카탈로그 결과가 성공한 경우에도 입력 중인 제시어를 함께 표시하도록 조건을 분리했다. 결과 탭을 선택하면 제시어를 닫아 탭 콘텐츠를 가리지 않으며, 새 검색어를 입력하면 이전 제시어를 즉시 비운다.

## 검증 결과

- 실제 운영 토큰·`annette askvik` 후보 비교: TIDAL HTTP 200, `topHits` 관계·아티스트 `profileArt`·플레이리스트 `coverArt` 포함
- 검색 컴포넌트 focused Vitest 7개 통과
- 전체 Vitest 84개 파일·344개 테스트, lint 오류 0(기존 경고 3), build·TypeScript 통과

## 미검증 항목

- 로그인된 Chrome 화면에서 결과 카드가 표시되는 최종 픽셀 검증은 배포 후 확인한다.
