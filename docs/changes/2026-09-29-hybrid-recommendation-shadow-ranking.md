# 하이브리드 추천 shadow ranking

## 변경 이유

사용자 오디오 취향 프로필 기반은 마련됐지만 실제 GMS 후보에서 텍스트와 오디오 점수를 함께 계산했을 때 순위·coverage·다양성이 어떻게 달라지는지 추적할 수 없었다. 기존 추천 응답과 순서를 바꾸지 않은 채 동일 후보를 비교하고, 실제 관찰값으로 제한 활성화 기준을 정할 수 있는 shadow ranking 계층이 필요했다.

## 변경 내용

- `025_recommendation_shadow_runs.sql`에 사용자별 shadow 실행과 후보별 비교 결과를 분리해 저장하는 테이블을 추가했다. text/audio profile version, audio model revision, baseline·hybrid 순위, component coverage, fallback과 집계 지표만 저장하며 embedding vector·원본 DSP·preview URL·token은 저장하지 않는다.
- 기존 GMS SQL의 active·KR STREAM·소유 playlist·accept/reject 제외 조건과 최대 `limit × 5` 후보를 유지했다. 기존 `rankEmsCandidates`가 만든 결과만 응답하고, 같은 후보 집합을 별도 `hybrid-v0` 계산에 사용한다.
- 최신 completed 오디오 프로필이 있으면 그 프로필에 고정된 feature·MAEST·MusicNN version과 정확히 일치하는 후보 분석 결과만 hydrate한다. 프로필이나 후보 오디오가 없으면 값을 추정하지 않고 component별 fallback으로 남긴다.
- similarity는 text 0.45, audio 0.40, mood 0.10, rhythm 0.05를 사용 가능한 component 사이에서 재정규화한다. 비교용 base score는 hybrid similarity 0.65, match confidence 0.15, freshness 0.10, catalog priority 0.10이다.
- Selector는 base score와 track ID로 결정적으로 정렬한 뒤 이미 선택된 같은 artist 후보에 0.075를 감점한다. overlap@K, 전체 후보 평균 rank displacement, 같은 artist 비중, selector 변경 수와 audio/mood/rhythm coverage를 기록한다.
- recommendation route는 Next.js `after()`에서 shadow transaction을 실행한다. 저장 실패는 이미 반환한 baseline 응답에 영향을 주지 않으며, text profile이나 후보가 없으면 shadow row를 만들지 않는다.
- `GMS_RANKING_VERSION`과 hybrid serving 전환은 추가하지 않았다. 이번 변경은 관찰만 수행한다.

## 검증 결과

- 구현 전 새 migration·모듈·repository export 부재로 계약 테스트가 실패하는 것을 확인한 뒤 구현했다.
- 관련 route·repository·migration·pure module Vitest 7개 파일, 21개 테스트를 통과했다.
- 전체 Web Vitest는 128개 파일 통과·3개 skip, 488개 테스트 통과·3개 skip이다. jsdom media 경고 외 새 실패는 없다.
- `npx tsc --noEmit`, ESLint 오류 0, Next.js production build를 통과했다. ESLint의 기존 경고 5개는 이번 변경 파일 밖에 있다.
- 임시 `pgvector/pgvector:0.8.6-pg16-bookworm` DB에 migration 25개를 적용하고 opt-in PostgreSQL 통합 테스트를 통과했다. 768차원 text profile, 2,304차원 audio profile과 후보 3개를 넣어 baseline 응답 2곡이 유지되고 exact-version audio coverage 1곡, text fallback, run 1개와 후보 3개 저장을 확인했다.
- 같은 임시 DB에서 025 down SQL이 shadow 테이블만 제거하고 text/audio profile 테이블을 보존하는지 확인한 뒤 025를 재적용했다. 최종 SQL 수정 뒤 새 임시 DB에서도 25개 migration과 통합 테스트를 다시 통과했다.
- 운영 적용 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-025-shadow-ranking-20260929-094032.dump`를 만들고 PostgreSQL 컨테이너의 `pg_restore --list`로 판독했다. SHA-256은 `3b715e6c51e9acb7430d54fe1b5499f79e9e3179ffd4d1bc2241fc5fc784f142`, 크기는 176,922,145바이트다.
- 운영 migration은 24개에서 25개로 증가했고 최신 ID는 `025_recommendation_shadow_runs.sql`이다. 두 shadow 테이블이 생성됐으며 배포 직후 run·candidate·audio profile 행은 모두 0개다.
- 배포 뒤 Web은 healthy다. local live·ready·Home·EMS·GMS·Search와 공개 Home·EMS·GMS·Search·ready는 HTTP 200, 비인증 recommendation API는 HTTP 401이었다. 최근 Web 오류 로그는 0건이다.
- Web만 재생성했다. PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `1d3a10e11243`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 유지됐다.

## 배포와 rollback

- 기능 커밋: `41c4c2c`
- archive SHA-256: `93d612b2bc1b6b5c04a18b1913f317acfe90cb7875707339e1cfe4da69d74f4c`
- Zorin release: `/home/approid/apps/music-pie/releases/41c4c2c`
- 새 Web image: `sha256:001326f47ced1f435c82a5b6b903c4ef7291dd8eeba60f802ed42fcf2ebb4b56`
- 새 Web container: `4e5b2511d410`
- rollback image: `music-pie-web:pre-41c4c2c` → `sha256:a11db3345b9b1a4e715f5dc50d1d059f770c10f9d1fab40ca0fa8813e9b70233`
- 문제가 생기면 Web image와 `current` symlink를 이전 release로 되돌린다. 025는 additive이고 shadow 데이터는 serving 원본이 아니므로 운영 rollback에서 down SQL로 데이터를 삭제하지 않는다.

## 미검증·다음 작업

- 운영에는 completed 사용자 오디오 프로필이 없어 인증된 자연 사용자 요청 전까지 audio component가 포함된 shadow 관찰값이 없다. 검증을 위해 임의 로그인 세션이나 추천 요청을 만들지 않았다.
- 실제 cohort의 coverage·순위 변화·사용자 결정 분포가 없으므로 activation threshold, 보관 기간과 자동 정리 정책은 확정하지 않았다.
- 다음 단계는 자연 발생 shadow cohort를 평가하고 threshold·cohort·request 단위 fallback·rollback 기준을 별도 기록한 뒤 제한된 사용자에게만 `hybrid-v0` serving을 검토하는 것이다.
