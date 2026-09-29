# 하이브리드 추천 제한 serving 안전 기반

## 변경 이유

`hybrid-v0` shadow 점수는 계산할 수 있었지만 실제 GMS 응답을 안전하게 전환하는 설정·사용자 범위·coverage gate와 요청별 fallback 기록이 없었다. 또한 공개 GMS 페이지는 recommendation API가 아니라 repository를 직접 호출하므로 기존 route 전용 `after()`만으로는 자연 페이지 방문의 shadow 관찰이 쌓이지 않았다. 실제 cohort 없이 hybrid를 활성화하지 않으면서 이후 제한 실험을 명시적으로 통제할 기반이 필요했다.

## 변경 내용

- 서버 전용 `GMS_RANKING_VERSION`, `GMS_HYBRID_AUTH0_SUBJECTS`, `GMS_HYBRID_MIN_AUDIO_COVERAGE` 설정 parser와 결정 함수를 추가했다. 기본값·오타·wildcard·불완전 설정은 모두 `baseline`으로 fail closed한다.
- `hybrid-v0`는 ranking version이 정확히 일치하고 현재 Auth0 subject가 명시적 allowlist에 있으며 0보다 크고 1 이하인 coverage threshold가 설정된 경우에만 평가한다. completed audio profile이 없거나 후보 audio coverage가 threshold 미만이면 요청 단위로 baseline에 fallback한다.
- fallback은 `ranking_disabled`, `subject_not_allowlisted`, `coverage_threshold_unconfigured`, `audio_profile_unavailable`, `audio_coverage_below_threshold`로 구분한다.
- 같은 hydrate 결과에서 기존 baseline 응답과 hybrid selected 응답을 별도로 만든다. baseline 점수·순서 계약은 유지하고, hybrid 응답은 selected rank, selector score, reason code와 null을 제거한 numeric component를 사용한다.
- recommendation 응답과 트랙에 실제 `rankingVersion`을 포함한다. 사용자 결정에도 실제 ranking version을 저장하며, 배포 전 열린 브라우저처럼 필드가 없는 기존 요청은 `baseline`으로 정규화하고 알 수 없는 버전은 거부한다.
- 실제 `/gms` 서버 페이지와 `/api/recommendations`가 같은 prepare·selection 경로를 사용한다. 두 경로 모두 Next.js `after()`에서 shadow와 serving provenance를 저장하고 side effect 실패는 응답을 바꾸지 않는다.
- `026_recommendation_serving_provenance.sql`은 shadow run에 requested/served version, minimum coverage와 fallback reason을 추가하고 recommendation decision에 ranking version을 추가한다. 기존 행은 `baseline`으로 backfill하며 allowlist 원문·embedding·preview URL·token은 저장하지 않는다.
- production에는 새 hybrid 환경 변수를 추가하지 않았다. 배포 뒤에도 전체 사용자는 baseline이다.

## 검증 결과

- 구현 전 새 serving 모듈과 026 migration이 없어 계약 테스트가 실패하는 것을 확인한 뒤 구현했다.
- route·GMS page·repository·decision·serving·migration 관련 테스트 8개 파일, 40개 테스트를 통과했다. 최종 연결 수정 뒤 핵심 6개 파일, 27개 테스트도 다시 통과했다.
- 전체 Web Vitest는 131개 파일 통과·3개 skip, 501개 테스트 통과·3개 skip이다. jsdom media 경고 외 새 실패는 없다.
- `npx tsc --noEmit`, ESLint 오류 0, Next.js production build 48개 경로를 통과했다. ESLint의 기존 경고 5개는 이번 변경 범위 밖 또는 기존 테스트 경고다.
- 임시 `pgvector/pgvector:0.8.6-pg16-bookworm` DB에 migration 26개를 적용하고 실제 text/audio profile과 후보를 사용한 PostgreSQL 통합 테스트를 통과했다. 저장된 shadow run의 requested/served version과 fallback reason을 확인했다.
- 같은 임시 DB에서 026 down SQL이 새 열만 제거하고 shadow 테이블과 기존 run을 보존하는지 확인했다. migration 레지스트리에서 026만 제거한 뒤 재적용해 26개 상태와 기존 row의 `baseline` backfill을 확인했다. 임시 컨테이너는 삭제했다.
- 운영 적용 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-026-serving-provenance-20260929-100728.dump`를 만들고 PostgreSQL 컨테이너의 `pg_restore --list`로 판독했다. SHA-256은 `ba8bd24154dade7a43c8ac34c425ac9c511494f3a1ac4c678c651f0056f43689`, 크기는 176,932,540바이트다.
- 운영 migration은 25개에서 26개로 증가했고 최신 ID는 `026_recommendation_serving_provenance.sql`이다. shadow run 열 4개와 decision ranking 열 1개가 생성됐다.
- 배포 뒤 Web은 healthy다. local live·ready·Home·EMS·GMS·Search와 공개 Home·EMS·GMS·Search·ready는 HTTP 200, 비인증 recommendation API는 HTTP 401이었다. 최근 Web 오류 로그는 0건이다.
- Web만 재생성했다. PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `1d3a10e11243`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 유지됐다.
- production의 세 hybrid 환경 변수는 모두 미설정이며 audio profile·shadow run·shadow candidate·recommendation decision 행은 모두 0개다. 인증 세션이나 사용자 요청을 임의로 만들지 않았다.

## 배포와 rollback

- 기능 커밋: `696a215`
- archive SHA-256: `92679b6b7a78c44a8edb92e5dcbea51f2c022055fff7d2fc6e668525d0a3316c`
- Zorin release: `/home/approid/apps/music-pie/releases/696a215`
- 새 Web image: `sha256:182bf72f811b93335c7cc28e037ce3ce13c39158c1dddff9cc54aed06398d79b`
- 새 Web container: `6de7e39137f1`
- rollback image: `music-pie-web:pre-696a215` → `sha256:001326f47ced1f435c82a5b6b903c4ef7291dd8eeba60f802ed42fcf2ebb4b56`
- serving rollback은 hybrid 설정 제거 또는 `GMS_RANKING_VERSION=baseline` 뒤 Web만 재생성하는 방식이 우선이다. 코드 rollback이 필요하면 Web image와 `current` symlink를 이전 release로 되돌린다. 026은 additive이므로 운영 rollback에서 down SQL로 provenance를 삭제하지 않는다.

## 미검증·다음 작업

- 운영 audio profile과 자연 shadow cohort가 없어 hybrid 결과를 실제 사용자에게 제공하거나 activation threshold를 확정하지 않았다.
- 보관 기간과 자동 정리 정책은 실제 관찰량이 생긴 뒤 별도 결정해야 한다.
- 다음 단계는 사용자 eligible 트랙과 exact-version 분석 결과의 교집합을 bounded 방식으로 확보하고 명시적으로 audio profile을 갱신한 뒤, 자연 GMS 방문의 coverage·순위 변화·결정 분포를 관찰하는 것이다. 그 결과 없이 production allowlist와 threshold를 설정하지 않는다.
