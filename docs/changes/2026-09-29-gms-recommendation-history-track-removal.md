# GMS 추천 이력 트랙 삭제

## 변경 이유

사용자 추천 이력 페이지에서 더 이상 보관하고 싶지 않은 개별 트랙을 정리할 수 있어야 한다. 다만 화면에서 삭제했다는 이유로 한 번 노출된 트랙이 추천 후보로 돌아오거나, 추천 당시의 근거와 사용자 액션 기록이 사라지면 안 된다.

## 변경 내용

- `user_recommendation_history_hidden_tracks` tombstone table과 rollback migration을 추가했다.
- `DELETE /api/recommendations/history`는 로그인 사용자가 소유한 batch에 실제 포함된 트랙만 숨긴다. 같은 요청은 멱등하게 성공하고, 존재하지 않거나 다른 사용자의 batch는 동일한 404로 처리한다.
- 이력 조회는 해당 사용자의 tombstone만 제외한다. 원본 recommendation JSON snapshot, `user_recommendation_exposures`, recommendation decision은 그대로 보존한다.
- `/gms/history`의 각 트랙에 접근 가능한 삭제 버튼을 추가했다. 확인 문구에서 삭제 후에도 다시 추천되지 않음을 알리고, 성공 시 즉시 목록에서 숨긴 뒤 server component를 갱신한다.
- 요청 처리 중에는 중복 삭제를 막고, 실패하면 트랙을 유지한 채 오류를 안내한다. 모든 트랙을 숨긴 batch 자체는 추천 시점과 상태 추적을 위해 남긴다.

## 검증 결과

- 저장소·migration·API·UI 타깃 4개 파일 22개 테스트가 통과했다.
- Web 전체 144개 파일 중 141개 통과·3개 skip, 총 551개 테스트 중 548개 통과·3개 skip이다.
- ESLint 오류 0개이며 기존 경고 6개만 남았다.
- production build와 TypeScript를 통과했고 새 `/api/recommendations/history`를 포함한 52개 page 생성을 확인했다.
- 격리 PostgreSQL에서 30개 migration 전체 적용, 030 rollback, 030 재적용을 확인했다. 표준 PostgreSQL 이미지는 기존 `vector` 확장을 제공하지 않아 중단됐고, 프로젝트와 같은 `pgvector/pgvector:0.8.6-pg16-bookworm` 이미지로 재검증했다. 두 임시 컨테이너는 각각 정확한 이름을 확인한 뒤 제거했다.

## 미검증·다음 작업

- 로그인된 운영 `/gms/history`의 desktop과 `390x844`에서 현재·지난 batch 24곡 모두의 삭제 버튼과 접근 가능한 이름을 확인했고 browser error·warning은 0건이다.
- 운영 사용자 데이터가 실제로 바뀌는 삭제 요청은 실행하지 않았다. 확인·성공·실패 흐름은 UI/API 자동화 테스트로 검증했다.

## 운영 배포

- 기능 커밋 `e92f7e5`를 local `main`에 fast-forward하고 `origin/main`만 push했다. 원격 `codex/anonymous-playback-error`는 `e1bbe73` 그대로 유지했다.
- release archive는 6,338,560바이트, SHA-256 `ee4b592f4c931bbdc6f1c0a77c9359541da340b55026d364817570de57f320d6`이며 Zorin release는 `/home/approid/apps/music-pie/releases/e92f7e5`다.
- migration 직전 custom-format backup `/home/approid/apps/music-pie/backups/pre-030-history-removal-e92f7e5.dump`는 209,244,354바이트, SHA-256 `be6ef8a36fd9979784d01c26f1d8387157a4cc9be65e0a4037d4d4500f08e4a0`이며 `pg_restore --list`를 통과했다.
- 030 migration 1건을 적용해 tombstone table과 migration 기록을 확인했다. 초기 tombstone은 0건이며 기존 recommendation batch 2건·exposure 24건은 유지됐다.
- Web image는 `sha256:246e16b96e30ba09bb328fd5db632134164d01c5c8f61c28d4cc08cd58b67dcf`, container는 `5c1ed913f675`이고 healthy·restart 0이다. rollback image `music-pie-web:pre-history-track-removal-e92f7e5`는 `sha256:1acdcd39bc089bf9b2a73c1b8498610580605b95de83870fcca97f3fcf094c8f`다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `70208048b7c2`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았다.
- local/public ready와 `/gms/history`는 HTTP 200이고 비인증 DELETE는 401이다. 최근 10분 Web 오류 로그는 0건이며 잔여 `infra-web-1` 또는 migration run container는 없다.
