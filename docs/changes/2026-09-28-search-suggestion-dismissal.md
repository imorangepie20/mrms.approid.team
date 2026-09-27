# 검색 완료 후 제시어 닫기

## 이유

제시어 API와 카탈로그 검색 API를 모두 기다린 뒤 상태를 함께 반영해, 검색 결과가 표시된 뒤에도 제시어 목록이 결과 상단을 가렸다.

## 변경

- 제시어 요청과 카탈로그 검색 요청의 상태 반영을 분리했다.
- 제시어가 먼저 도착하면 검색 진행 중에 표시한다.
- 현재 카탈로그 검색이 성공해 결과를 반영하는 순간 제시어를 비운다.
- 카탈로그 검색이 실패하면 사용자가 다른 검색어를 선택할 수 있도록 제시어와 오류 안내를 함께 유지한다.
- 새 입력의 이전 제시어 정리, 요청 ID 기반 오래된 응답 차단, 결과 탭 선택 시 닫기는 유지한다.

## 검증

- 검색 focused Vitest: 1개 파일, 7개 테스트 통과.
- 변경 파일 ESLint: 오류·경고 0건.
- 전체 Vitest: 101개 파일 중 99개 통과, 396개 중 393개 통과. 기존 likes/recommendations 인증 mock 3건의 `503` 실패가 동일하게 남았다.
- `npm run build`: Next.js production build와 TypeScript 통과.
- 로그인된 public Search에서 `liverty` 입력 후 결과와 5개 탭이 표시되고 제시어 listbox가 0개인 것을 확인했다.

## 운영 경계

- DB schema와 data write는 없다.
- 사용자 데이터, TIDAL 연결, active EMS catalog와 상시 worker를 변경하지 않는다.
- 비밀값, token, cookie, signed URL과 raw query를 출력하거나 기록하지 않는다.

## 롤백

- 기능 커밋 `94657c3`을 release `/home/approid/apps/music-pie/releases/94657c3`과 Web image `sha256:1311ffcf...`로 배포했다.
- Web 컨테이너는 `healthy`이고 local/public Search·MMS·EMS·readiness는 HTTP `200`이다.
- DB migration과 data write는 수행하지 않았다. EMS pipeline `7312158fc9b0...`과 source routines `d5e6f27110e6...`의 image·시작 시각은 배포 전후 동일하다.
- rollback은 이전 release `/home/approid/apps/music-pie/releases/aa5192c`과 `music-pie-web:pre-search-suggestions-94657c3`(`sha256:2389b2f...`)이다. 문제가 생기면 이전 image를 `current`로 복원하고 release symlink를 되돌린 뒤 Web만 재생성한다.
