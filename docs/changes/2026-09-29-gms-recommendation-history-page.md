# GMS 사용자 추천 트랙 이력 페이지

## 변경 이유

GMS의 기존 `이전 추천 기록`은 현재 화면 아래 접이식 영역에서 최근 교체 batch 10개만 보여 줬다. 사용자가 추천받은 시점과 현재·지난·소진 상태, 각 트랙에 내린 결정을 한곳에서 계속 확인하고 다시 재생할 수 있는 독립 화면이 필요했다.

## 변경 내용

- `/gms/history`를 추가하고 사용자별 recommendation batch 전체를 최신순 10개 단위로 조회한다. 요청 page가 범위를 벗어나면 마지막 페이지로 제한한다.
- 현재 `current`, 교체된 `replaced`, 후보가 끝난 `exhausted` batch를 모두 표시한다. 저장된 snapshot은 읽기만 하며 노출 이력과 재추천 제외 상태는 바꾸지 않는다.
- 페이지에 포함된 트랙의 사용자별 최신 recommendation decision을 결합해 `MMS로 보냄`, `싫어요`, `건너뜀`, `결정 없음`으로 표시한다.
- 각 batch는 기존 `TrackList`를 사용해 재생, 플레이리스트 추가, 좋아요를 지원한다. 트랙 재생 시 해당 batch의 트랙만 대기열로 설정한다.
- GMS의 접이식 최근 이력은 제거하고 오디오 취향 프로필 옆의 `추천 이력 보기` 링크로 교체했다.
- 비로그인 또는 TIDAL 미연결 상태에서는 개인 이력 DB를 읽지 않고 기존 개인화 접근 안내를 표시한다.

## 검증 결과

- 저장소·GMS page·이력 page·dashboard·이력 목록 타깃 5개 파일 29개 테스트가 통과했다.
- Web 전체 142개 파일 중 139개 통과·3개 skip, 총 539개 테스트 중 536개 통과·3개 skip이다.
- ESLint 오류 0개이며 기존 경고 6개만 남았다.
- production build와 TypeScript를 통과했고 `/gms/history`를 포함한 51개 page 생성을 확인했다.
- 로컬 비로그인 `/gms/history`는 HTTP 200이며 로그인 복귀 경로가 `/api/auth/login?returnTo=/gms/history`로 유지됐다.
- `390x844` viewport에서 제목, GMS 복귀, 접근 안내, 하단 navigation과 player가 겹치지 않는 것을 확인했다.

## 미검증·다음 작업

- 로그인된 운영 화면에서 실제 current·replaced batch와 트랙 결정 label을 확인했다. 이력에서 실제 재생 버튼은 사용자 재생 상태를 바꾸므로 실행하지 않았다.
- 실제 `다시 추천 받기`는 비가역적으로 새 exposure를 만드는 동작이므로 이 페이지 검증을 위해 실행하지 않는다.

## 운영 배포

- 기능 커밋 `dbc4a39`를 local `main`에 fast-forward하고 `origin/main`만 push했다. 원격 `codex/anonymous-playback-error`는 `e1bbe73` 그대로 유지했다.
- release archive는 6,307,840바이트, SHA-256 `a77b384b83cbdf695b8aec57276f347323ad8f6ecbfe965b8a6ef869fb28901e`이며 Zorin release는 `/home/approid/apps/music-pie/releases/dbc4a39`다.
- 새 migration은 없다. Web image는 `sha256:1acdcd39bc089bf9b2a73c1b8498610580605b95de83870fcca97f3fcf094c8f`, container는 `74313287d9a7`이고 healthy·restart 0이다. rollback image `music-pie-web:pre-gms-history-page-dbc4a39`는 `sha256:6653a7eabbb9ebb39768084a5e05db36f863333aec6dc8fa86e3275e48ae9d3a`다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `70208048b7c2`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았다.
- local/public ready·GMS·`/gms/history`는 HTTP 200이고 비인증 recommendation API는 401이다. 최근 10분 Web 오류 로그는 0건이다.
- 로그인 Chrome에서 이력 총 2회, 현재 baseline 12곡과 지난 hybrid 12곡을 확인했다. 과거 batch의 실제 accept 1건은 `MMS로 보냄`, reject 1건은 `싫어요`, 나머지는 `결정 없음`으로 표시됐다.
- 첫 Compose 실행에서 프로젝트 이름을 생략해 시작되지 않은 `infra-web-1`이 생성됐지만 기존 Web은 계속 healthy였다. 생성 상태의 해당 컨테이너만 제거하고 `-p music-pie`를 명시해 Web만 정상 교체했으며 잔여 `infra-web-1`이 없음을 확인했다.

