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

- 로그인된 운영 화면의 실제 current batch·트랙 결정 label·재생은 배포 뒤 확인한다.
- 실제 `다시 추천 받기`는 비가역적으로 새 exposure를 만드는 동작이므로 이 페이지 검증을 위해 실행하지 않는다.

