# GMS 영구 추천 이력과 명시적 batch 회전 계획

## 목표

사용자에게 실제 제공한 GMS 트랙을 영구 추천 이력으로 저장하고 같은 사용자에게 다시 추천하지 않는다. 브라우저 새로고침은 현재 추천 batch를 유지하며, 사용자가 `다시 추천 받기`를 눌렀을 때만 현재 batch를 종료하고 unseen 트랙으로 다음 batch를 만든다. unseen 후보가 소진되면 과거 트랙을 재사용하지 않고 명시적인 소진 상태를 제공한다.

## 확정 규칙

- 실제 화면 또는 recommendation API에 제공된 트랙은 사용자별 영구 exposure다. 사용자 액션 유무와 관계없이 재추천하지 않는다.
- 노출은 취향의 긍정·부정 신호가 아니다. 기존 `accept`·`reject`와 취향 profile 규칙은 유지한다.
- 새로고침과 반복 GET은 저장된 current batch를 반환하며 새 트랙을 소비하지 않는다.
- `다시 추천 받기`만 current batch를 `replaced`로 바꾸고 다음 batch를 만든다.
- 버튼 요청은 client가 보낸 current batch ID와 DB current batch ID가 일치할 때만 회전한다. 중복·지연 요청은 이미 만들어진 current batch를 반환한다.
- 수락·거절 완료 트랙은 current batch snapshot에는 남기되 다시 읽을 때 결정 대기 목록에서는 제외한다. 지난 추천 이력에는 유지한다.
- unseen 후보가 없으면 `exhausted` batch를 저장하고 버튼을 비활성화한다. exposure 삭제·기간 만료·자동 재사용은 없다.
- shadow는 30일 진단 데이터이므로 영구 추천 이력의 근거로 사용하지 않는다.

## 데이터 모델

### `user_recommendation_batches`

- 사용자, 상태(`current|replaced|exhausted`), profile/ranking version, 실제 제공 recommendation snapshot JSON, track ID 배열과 생성·교체 시각을 저장한다.
- 사용자별 `current|exhausted` batch는 하나만 허용한다.
- snapshot은 화면 재로딩과 과거 이력 표시를 위한 실제 제공 결과이며 token·preview URL·embedding·원본 DSP는 저장하지 않는다.

### `user_recommendation_exposures`

- `(user_id, track_id)`를 primary key로 두어 영구 중복 노출을 DB에서 차단한다.
- 최초 batch, position, ranking version과 추천 시각을 저장한다.
- 사용자·batch FK를 유지하고 자동 cleanup을 두지 않는다. EMS track 삭제가 사용자 이력 때문에 막히지 않도록 track ID는 snapshot 식별자로 보존하되 EMS FK는 두지 않는다.

## 구현 순서

1. `029_recommendation_batches.sql`·down·migration test를 추가한다.
2. 추천 후보 SQL에서 같은 사용자의 exposure를 제외한다.
3. repository에 사용자 row lock 기반 `get-or-create current`, expected batch ID 기반 `rotate`, 최근 replaced history 조회를 추가한다.
4. current batch 생성과 exposure 12건 저장을 한 transaction에서 처리하고 실패 시 전부 rollback한다.
5. `/gms` page와 recommendation GET을 current batch 기반으로 바꾸고, `POST /api/recommendations/refresh`를 추가한다.
6. GMS에 `다시 추천 받기` control, irreversible 안내, loading/error, exhausted 상태와 최근 추천 이력을 추가한다.
7. 단위·route·page·repository·PostgreSQL 통합, 전체 Web test·lint·build를 실행한다.
8. 운영 배포 전 current batch 이후 최소 120 unseen candidate의 exact audio coverage를 확인하고 부족분은 별도 bounded cohort·backup·요청 예산으로 채운다. coverage가 부족하면 버튼 활성화를 보류하거나 fail-closed baseline 동작을 명시적으로 승인한다.

## 검증 기준

- 같은 사용자의 연속 page/GET은 같은 batch ID와 같은 track 순서를 반환한다.
- 올바른 current batch ID의 첫 POST만 새 batch를 만들고 동일 ID 재요청은 추가 batch를 만들지 않는다.
- 새 batch와 이전 batch의 track 교집합은 0이다.
- exposure unique 제약과 사용자 row lock으로 동시 요청에서도 중복이 없다.
- accept/reject 트랙은 current pending 목록에서 사라지지만 history에는 남는다.
- 후보 소진 후 track 0, `exhausted=true`, 버튼 비활성화이며 과거 track 재사용은 없다.
- 다른 사용자의 exposure는 현재 사용자의 후보에 영향을 주지 않는다.
- rollback은 029 객체만 제거하고 decision·profile·EMS·shadow를 건드리지 않는다.

## Git·배포

- local feature branch에서 구현·검증하고 feature branch는 원격에 push하지 않는다.
- 준비 완료 후 local `main`에 fast-forward하고 `origin/main`만 push한다.
- 운영 backup과 `pg_restore --list` 확인 뒤 029와 Web만 배포한다. PostgreSQL 외 비-Web container는 재생성하지 않는다.

## 구현 진행 결과

- migration·repository·API·page·GMS control·history·exhausted 상태 구현을 완료했다.
- Web 전체 테스트 528개, lint 오류 0, production build와 격리 PostgreSQL 029 apply/down/reapply를 통과했다.
- 현재 batch 이후 운영 reserve를 49/120에서 120/120 exact component coverage로 보강했다. 73건 stage, 71건 완료, `preview_forbidden` 2건, provider 요청 151회다.
- 기능 커밋 `d1f9954`를 local `main`에 fast-forward하고 `origin/main`만 push했다. 운영 backup·029·Web 배포와 로그인 브라우저 새로고침 회귀까지 완료했다.
