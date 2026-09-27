# 검색 제시어 외부 클릭 닫기

## 이유

검색 성공 시 제시어를 즉시 닫는 동작은 결과가 갱신될 때 UI가 갑자기 사라져 부자연스러웠다. 자동완성은 입력 맥락 안에서는 유지하고, 사용자가 다른 영역으로 이동했다는 명확한 신호에서 닫아야 한다.

## 변경

- 제시어 데이터와 박스의 열림 상태를 분리했다.
- 검색 결과가 완료되어도 제시어 박스를 유지한다.
- 검색창과 제시어 박스 밖의 `pointerdown`에서 박스를 닫는다.
- 닫을 때 제시어 데이터는 보존해 검색창을 다시 누르거나 focus하면 즉시 다시 연다. 제목처럼 포커스를 받지 않는 외부 영역을 눌러 입력창 포커스가 남은 경우도 실제 `pointerdown`에서 다시 연다.
- `Escape`로도 닫으며, 늦게 도착한 현재 요청의 제시어 응답이 닫힌 박스를 다시 열지 못하게 한다.
- 새 검색어 입력, 제시어 선택, 결과 탭 선택, 검색 실패 fallback과 오래된 요청 차단은 유지한다.

## 검증

- 검색 focused Vitest: 1개 파일, 7개 테스트 통과.
- 변경 파일 ESLint: 오류·경고 0건.
- 전체 Vitest: 101개 파일 중 99개 통과, 396개 중 393개 통과. 기존 likes/recommendations 인증 mock 3건의 `503` 실패가 동일하게 남았다.
- `npm run build`: Next.js production build와 TypeScript 통과.
- 기능 커밋 `fa3e1ab`, Zorin release `fa3e1ab`, Web image `sha256:80d0a8a79a40ad15653fb8c46e5455d1c938ebb5b33e2d83a7106ee2599b1f6e`를 배포했고 컨테이너 `healthy`를 확인했다.
- public `/search`에서 `lever` 결과와 제시어 listbox가 함께 표시되는 것을 확인했다. 결과 영역 바깥 클릭 뒤 listbox는 0개였고, 새 입력으로 다시 연 뒤 `Escape`에서도 0개였다.
- public `/api/health/live`, `/api/health/ready`, `/search`, `/mms`, `/ems`는 모두 HTTP 200이었다.
- 입력창 포커스가 남은 상태의 재클릭은 focused Vitest의 document `pointerdown` 재현으로 검증했다. 브라우저 자동화 드라이버는 이미 focus된 입력에 두 번째 포인터 이벤트를 전달하지 않아 이 한 경로의 실브라우저 자동 검증은 남겼다.

## 운영 경계

- DB schema와 data write는 없다.
- 사용자 데이터, TIDAL 연결, active EMS catalog와 상시 worker를 변경하지 않는다.
- 비밀값, token, cookie, signed URL과 raw query를 출력하거나 기록하지 않는다.

## 롤백

- 변경 전 release `/home/approid/apps/music-pie/releases/72fd07d`와 Web image `sha256:1311ffcff5466a672e0a08fd44a8167c596da64f88b721214ccdd236bfb9290d`를 `music-pie-web:pre-search-outside-392d98a`로 보존했다.
- 문제가 생기면 이 image를 `current`로 복원하고 release symlink를 `72fd07d`로 되돌린 뒤 Web만 재생성한다.
- EMS pipeline과 source-routines의 container ID, image `sha256:a8a84e4716c3d2afa8cc1180a2cc8ea7b227371ac5598f8777093743a9d0ecee`, 시작 시각은 배포 전후 동일하다.
