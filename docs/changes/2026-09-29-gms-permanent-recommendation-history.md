# GMS 영구 추천 이력과 명시적 다시 추천

## 변경 이유

기존 GMS는 추천 결과를 영구 노출 이력으로 저장하지 않아 사용자가 아무 결정도 하지 않으면 같은 곡이 반복될 수 있었다. 브라우저 새로고침은 현재 추천을 유지하되 사용자가 명시적으로 요청할 때만 다음 unseen batch로 이동하고, 전체 후보가 소진되면 과거 곡을 재사용하지 않는 계약이 필요했다.

## 변경 내용

- migration 029에 사용자별 recommendation batch와 영구 exposure를 추가했다. `(user_id, track_id)` unique로 한 번 실제 제공한 곡의 재추천을 막고, 사용자별 `current|exhausted` batch는 하나만 허용한다.
- 현재 batch snapshot에는 실제 제공 순서·점수·사유를 저장한다. 새로고침과 반복 GET은 이 snapshot을 반환하며 추천 후보를 추가 소비하지 않는다.
- `다시 추천 받기`는 client가 본 current batch ID와 DB current batch ID가 일치할 때만 row lock transaction에서 기존 batch를 `replaced`로 바꾸고 다음 batch와 exposure를 함께 만든다. 지연·중복 요청은 이미 생성된 current batch를 반환한다.
- accept·reject한 곡은 current 결정 대기 목록에서 숨기지만 제공 이력에는 남긴다. 최근 replaced batch 10개는 GMS의 `이전 추천 기록`에서 확인할 수 있다.
- unseen 후보가 없으면 빈 `exhausted` batch를 영구 상태로 저장하고 버튼을 비활성화한다. exposure TTL·cleanup·자동 재사용은 없다.
- exposure의 track ID는 EMS FK로 묶지 않아 EMS 원본 삭제를 막지 않는다. 사용자 삭제 시 batch와 exposure는 함께 제거된다.

## 검증 결과

- 영구 batch migration·repository·GET/POST route·GMS page·UI 타깃 6개 파일 31개 테스트가 통과했다. exposure 후보 제외 회귀를 추가한 최종 타깃 5개 파일 33개 테스트도 통과했다.
- Web 전체 137개 파일·528개 테스트가 통과했고 조건부 PostgreSQL 3개 파일·3개 테스트는 전용 환경 변수가 없어 skip됐다.
- ESLint 오류 0, 기존 경고 6개다. production build·TypeScript와 `/api/recommendations/refresh`를 포함한 50개 route 생성을 통과했다.
- 격리 PostgreSQL에서 029 apply/down/reapply를 통과했다. 같은 사용자의 exposure 중복과 두 번째 active batch가 unique 위반으로 차단되고, 사용자 삭제 시 batch·exposure가 모두 0건으로 cascade되는 것을 확인했다.
- 운영 current batch를 제외한 다음 후보 120개는 보강 전 exact audio·mood·rhythm 입력이 49/120이었다. 12곡 이하의 7개 bounded cohort로 73건을 stage해 71곡을 완료했고 2곡은 `preview_forbidden`으로 영구 제외했다. provider 요청은 총 151회이며 마지막 backfill 뒤 reserve는 120/120 exact다.
- reserve cohort는 모두 concurrency 1, UUID allowlist, 곡당 최대 2회와 token 1회를 합친 요청 상한으로 실행했다. 각 cohort 전 custom-format backup과 `pg_restore --list`를 확인했다.
  - `pre-gms-refresh-reserve-1-20260929-160645.dump`: 199,234,063바이트, SHA-256 `bd329a26062c091b4d5dba0ae08096ad2819486733058934c8cd4f13feea8d11`
  - `pre-gms-refresh-reserve-2-20260929071115.dump`: 199,930,710바이트, SHA-256 `d049f5f179b0e64546b561856b8311cc8799307aea709483d971e72f1ae0e66d`
  - `pre-gms-refresh-reserve-3-20260929071420.dump`: 200,438,303바이트, SHA-256 `b89fbb2972d75e387093e5bb9e570b5bc965ab77fb223e34846a6004843e7eca`
  - `pre-gms-refresh-reserve-4-20260929071728.dump`: 200,953,935바이트, SHA-256 `b844c56089390026e6571fe243e56a88eb21c7993c07eac148c01dd33b520f9c`
  - `pre-gms-refresh-reserve-5-20260929072037.dump`: 201,507,734바이트, SHA-256 `cac72388b2c19a8d9331a0026b79fa6eab300ad5081f632a4fc08e6c738362fc`
  - `pre-gms-refresh-reserve-6-20260929072351.dump`: 202,075,309바이트, SHA-256 `be544f45360eac415eafe4bad030dc38cd79a34aea1a7c776334833a5b641049`
  - `pre-gms-refresh-reserve-7-20260929072729.dump`: 202,614,683바이트, SHA-256 `bf75390d0196bb6933acd0f488151a7e36a64e0f38fe7b8267397652847412a1`
- reserve 완료 뒤 전체 audio job은 completed 147·failed 4이고 pending·running·retryable은 0이다. audio-analysis와 EMS worker는 healthy·restart 0, host disk 51%, available memory 약 2.8GiB다.

## 미검증·다음 작업

- 기능 release의 운영 migration·Web 배포와 로그인 GMS 브라우저 회귀는 아직 수행하지 않았다.
- reserve 120곡은 현재 catalog·profile snapshot 기준이다. 이후 원천 갱신으로 상위 후보가 교체되면 full-component gate가 baseline으로 닫힐 수 있으므로 serving provenance를 계속 확인한다.
