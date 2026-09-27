# TIDAL 재생 세션 재연결 보존

## 이유

일반 TIDAL OAuth 연결과 전체 재생용 Device Code 세션이 사용자별 `tidal_connections` 한 행을 공유한다. 사용자가 전체 재생을 승인한 뒤 일반 TIDAL 연결을 다시 완료하면 일반 scope와 token이 Device 세션을 덮어썼다. 계정 연결 상태는 `connected`지만 재생 scope가 사라져 하단 플레이어가 `TIDAL 재생 연결`을 다시 표시했다.

## 변경

- 일반 OAuth callback 저장을 `storeTidalAuthorizationToken()`으로 분리했다.
- 같은 Auth0 사용자와 같은 TIDAL 사용자에게 갱신 가능한 Device 세션이 있으면 일반 OAuth token으로 덮어쓰지 않는다.
- TIDAL 사용자 ID가 다르거나, Device 세션이 만료됐고 refresh token도 없으면 새 일반 OAuth 연결로 교체한다.
- 판정과 저장은 transaction의 `FOR UPDATE` 잠금 안에서 수행해 token refresh 및 동시 연결과 직렬화한다.
- Device Code 연결 성공 뒤 현재 곡을 다시 시도해 버튼을 없애는 기존 UI 동작은 유지한다.
- DB schema, 사용자 음악 데이터, EMS catalog와 상시 worker는 변경하지 않는다.

## 검증

- 연결 저장소·callback focused Vitest: 2개 파일, 12개 테스트 통과.
- 전체 Vitest: 101개 파일 중 99개 통과, 396개 중 393개 통과. 기존 likes/recommendations 인증 mock 3건이 예상 `200/204` 대신 `503`을 반환하는 기존 실패가 동일하게 남았다.
- ESLint: 오류 0건, 기존 경고 5건.
- `npm run build`: Next.js production build와 TypeScript 통과.
- `git diff --check`: 통과.

## 보안·데이터 경계

- 보존은 두 TIDAL 사용자 ID가 모두 존재하고 정확히 같은 경우에만 허용한다. 다른 계정이나 사용자 ID를 확인할 수 없는 연결은 이전 Device 세션을 승계하지 않는다.
- token, cookie, Device Code, signed stream URL과 raw query를 코드·문서·로그에 기록하지 않는다.
- 현재 운영 행에서 이미 덮어써진 Device 자격 증명을 복구하거나 추정하지 않는다. 배포 뒤 사용자가 전체 재생 연결을 한 번 다시 승인해야 한다.

## 배포·롤백

- 기능 커밋 `78d028b`를 release `/home/approid/apps/music-pie/releases/78d028b`와 Web image `sha256:2389b2f...`로 배포했다.
- Web 컨테이너만 재생성했고 `healthy`다. local/public Home·MMS·EMS·readiness는 모두 HTTP `200`이다.
- 로그인된 public MMS를 새로고침해 가져온 플레이리스트 5개와 전역 플레이어 렌더링을 확인했다.
- DB migration과 data write는 수행하지 않았다. EMS pipeline `7312158fc9b0...`과 source routines `d5e6f27110e6...`의 image·시작 시각은 배포 전후 동일하다.
- rollback은 이전 release `/home/approid/apps/music-pie/releases/9adacf8`과 `music-pie-web:pre-tidal-session-78d028b`(`sha256:4281f99f...`)이다. 문제가 생기면 이전 image를 `current`로 복원하고 release symlink를 되돌린 뒤 Web만 재생성한다.

## 미검증·다음 작업

- 운영 행은 배포 전에 이미 일반 OAuth scope로 교체되어 있었다. 사용자가 전체 재생 연결을 한 번 다시 승인한 뒤 버튼 해제, `FULL` manifest와 실제 재생을 확인해야 한다.
- 그 승인 뒤 일반 TIDAL OAuth를 다시 완료해도 Device scope가 유지되는 production 실계정 회귀는 사용자 승인 흐름을 포함하므로 아직 실행하지 않았다. 자동 테스트가 같은 계정 보존과 다른 계정 교체 경계를 담당한다.
