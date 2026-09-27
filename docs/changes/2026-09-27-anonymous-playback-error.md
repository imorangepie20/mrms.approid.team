# 비회원 재생 오류 안내 보완

## 변경 이유

공개 Home·EMS에서 비회원이 트랙 재생을 시도하면 스트림 API의 내부 오류 코드 `unauthorized`가 전역 플레이어의 접근성 알림에 그대로 노출됐다. 사용자가 다음 행동을 알 수 있는 안내와 로그인 진입점도 없었다.

## 변경 내용

- `PersistentPlayer`가 재생 오류 코드를 사용자용 한국어 문구로 변환하도록 했다.
- 비회원 오류에는 `로그인 후 재생` 링크를 표시하고 로그인 완료 뒤 현재 경로로 돌아오도록 `returnTo`를 전달한다.
- TIDAL 연결 필요 오류와 그 밖의 재생 오류도 내부 코드를 직접 노출하지 않는다.
- 비회원 오류의 로그인 링크, 안내 문구, 내부 코드 비노출을 회귀 테스트로 추가했다.

## 검증 결과

- 재현 테스트는 수정 전 `로그인 후 재생` 링크를 찾지 못하고 접근성 알림에 `unauthorized`가 남아 실패함을 확인했다.
- `npm test -- --run src/components/player/persistent-player.test.tsx`: 1개 파일, 9개 테스트 통과.
- `npm run lint -- src/components/player/persistent-player.tsx src/components/player/persistent-player.test.tsx`: 오류 없이 통과.
- `npm run build`: TypeScript와 Next.js production build 통과. Auth0 환경 변수가 없는 로컬 빌드 경고는 유지된다.

## 미검증·기존 실패

- 전체 Web 테스트는 93개 파일 중 90개 파일, 371개 중 367개 테스트가 통과했다. 이번 diff 밖의 기존 Home 렌더 기대값 1건과 likes·recommendations API의 HTTP 503 기대 불일치 3건은 격리 재실행에서도 실패했다.
- production 서버는 로컬 포트에서 시작됐지만 격리 작업 트리에 Auth0 환경 변수를 복사하지 않아 `/` 요청이 HTTP 500으로 끝났다. 프로세스는 종료했고 로컬 브라우저 검증 완료로 표시하지 않는다.
- 실제 Auth0 로그인 완료와 `/ems` 복귀는 실행하지 않았다.

## 운영 배포

- 커밋 `bc47ed34e971`을 Zorin release `/home/approid/apps/music-pie/releases/bc47ed34e971`로 배포하고 Web 컨테이너만 재생성했다.
- 이전 release `c7a002d`와 이미지 `music-pie-web:pre-anonymous-playback-bc47ed34e971`을 롤백 기준으로 보존했다. DB migration과 EMS 워커는 변경하지 않았다.
- Web 컨테이너 `healthy`, 내부·공개 readiness `ready`, 공개 `/`·`/ems` HTTP 200, 비회원 로그인 진입점 HTTP 307을 확인했다.
- 공개 `/ems`에서 실제 트랙을 선택한 뒤 `로그인 후 재생` 링크가 `returnTo=/ems`로 표시되고, 접근성 알림이 `로그인 후 재생할 수 있습니다.`이며 `unauthorized` 원문이 DOM에 없음을 확인했다. 브라우저 경고·오류와 배포 후 Web 로그 오류 패턴은 0건이었다.

## 다음 작업

- 실제 비회원 Auth0 로그인 완료 뒤 `/ems` 복귀와 TIDAL 연결 확인 화면을 확인한다.
- 전체 테스트의 기존 실패 4건은 별도 범위에서 원인과 기대 계약을 정리한다.

## 보안·롤백

- 토큰, 쿠키, Device Code, signed stream URL을 코드·문서·테스트·로그에 기록하지 않았다.
- 문제가 생기면 `music-pie-web:pre-anonymous-playback-bc47ed34e971`을 `current`로 복원하고 release symlink를 `c7a002d`로 되돌린 뒤 Web만 재생성한다.
