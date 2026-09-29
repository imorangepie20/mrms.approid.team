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

- 운영 DB backup·migration, Web 배포와 로그인 화면의 비파괴 확인은 아직 남아 있다.
- 운영 사용자 데이터가 실제로 바뀌는 삭제 확인은 실행하지 않는다. 확인 대화상자 취소와 테스트로 UI 경계를 검증한다.
