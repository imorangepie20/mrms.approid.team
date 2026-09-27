# 검색 제시어 외부 클릭 닫기

## 이유

검색 성공 시 제시어를 즉시 닫는 동작은 결과가 갱신될 때 UI가 갑자기 사라져 부자연스러웠다. 자동완성은 입력 맥락 안에서는 유지하고, 사용자가 다른 영역으로 이동했다는 명확한 신호에서 닫아야 한다.

## 변경

- 제시어 데이터와 박스의 열림 상태를 분리했다.
- 검색 결과가 완료되어도 제시어 박스를 유지한다.
- 검색창과 제시어 박스 밖의 `pointerdown`에서 박스를 닫는다.
- 닫을 때 제시어 데이터는 보존해 검색창을 다시 누르거나 focus하면 즉시 다시 연다. 제목처럼 포커스를 받지 않는 외부 영역을 눌러 입력창 포커스가 남은 경우도 실제 `click`으로 다시 연다.
- `Escape`로도 닫으며, 늦게 도착한 현재 요청의 제시어 응답이 닫힌 박스를 다시 열지 못하게 한다.
- 새 검색어 입력, 제시어 선택, 결과 탭 선택, 검색 실패 fallback과 오래된 요청 차단은 유지한다.

## 검증

- 검색 focused Vitest: 1개 파일, 7개 테스트 통과.
- 변경 파일 ESLint: 오류·경고 0건.
- 전체 Vitest: 101개 파일 중 99개 통과, 396개 중 393개 통과. 기존 likes/recommendations 인증 mock 3건의 `503` 실패가 동일하게 남았다.
- `npm run build`: Next.js production build와 TypeScript 통과.
- 배포와 public browser 결과는 완료 후 기록한다.

## 운영 경계

- DB schema와 data write는 없다.
- 사용자 데이터, TIDAL 연결, active EMS catalog와 상시 worker를 변경하지 않는다.
- 비밀값, token, cookie, signed URL과 raw query를 출력하거나 기록하지 않는다.

## 롤백

- 배포 전 release와 Web image를 보존한다.
- 문제가 생기면 이전 image를 `current`로 복원하고 release symlink를 이전 대상으로 되돌린 뒤 Web만 재생성한다.
