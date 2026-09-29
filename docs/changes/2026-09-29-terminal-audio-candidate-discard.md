# terminal audio 후보 제외와 backfill

## 변경 이유

세 번째 GMS 후보 cohort에서 한 트랙의 KR `PREVIEW` playback-info가 HTTP 403으로 영구 거부됐다. 이 트랙을 미분석 fallback으로 남기면 partial coverage의 component availability 편향이 계속되고, raw 60곡을 분모로 두면 full coverage gate를 충족할 수 없다. EMS 원본과 실제 baseline 추천은 보존하면서 audio/hybrid 평가 집합에서만 terminal 후보를 명시적으로 제외할 정책이 필요했다.

## 변경 내용

- TIDAL playback-info HTTP 403을 non-retryable `preview_forbidden`으로 분리했다. 404·410은 기존 `preview_unavailable`을 유지하고, 기존 403 저장 행의 `preview_info_rejected`는 호환 terminal 코드로 읽는다.
- 추천 조회는 기존 `limit × 5` baseline pool과, terminal 후보를 건너뛰어 동일 크기까지 채운 hybrid pool을 한 번의 결정적 text 순서에서 구성한다.
- 실제 baseline 응답은 기존 pool만 사용하므로 순서와 포함 트랙을 바꾸지 않는다. hybrid shadow는 terminal 제외·backfill 후의 text baseline과 같은 후보 집합에서 비교해 coverage 분모와 rank displacement를 일치시킨다.
- `027_terminal_audio_candidate_provenance.sql`은 shadow run에 실제 제공 baseline, 제외 트랙·오류 코드, backfill 트랙을 별도 저장한다. 기존 run의 실제 제공 baseline은 기존 `baseline_track_ids`로 backfill한다.
- 제외는 EMS 원본 삭제나 사용자 `reject` 결정이 아니다. `STREAM` 가능 baseline 재생, 사용자 취향 profile 입력과 영구 싫어요 규칙은 변경하지 않는다.

## 검증 결과

- `services/ems-pipeline`: 전체 pytest 79개 통과. 별도 403 회귀 테스트에서 요청 2회 뒤 `preview_forbidden`, non-retryable, stop-run false를 확인했다.
- `apps/web`: 추천·shadow·025~027 migration 관련 5개 파일 17개 테스트 통과.
- `apps/web`: 전체 Vitest 133개 파일·509개 테스트 통과, 기존 조건부 suite 3개 파일·3개 테스트 skip.
- 임시 `pgvector/pgvector:0.8.6-pg16-bookworm` PostgreSQL에 migration 27개를 처음부터 적용하고 실제 추천 PostgreSQL 통합 테스트 1개를 통과했다. terminal 후보 제외와 shadow provenance 저장을 확인한 뒤 임시 컨테이너를 삭제했다.
- 변경 Web 파일 ESLint 오류·경고 0, 전체 ESLint 오류 0·기존 경고 5개다. Next.js production build와 TypeScript, 49개 route 생성을 통과했다.
- `git diff --check` whitespace 오류가 없다.

## 미검증·다음 작업

- 운영 migration·Web·EMS 배포와 기존 `preview_info_rejected` 행을 통한 자연 shadow 생성은 아직 수행하지 않았다.
- 이 정책은 후보 집합을 정규화할 뿐 partial coverage activation을 허용하지 않는다. hybrid 환경 변수는 계속 미설정으로 두고 full eligible coverage gate와 실제 순위 지표를 별도로 확인한다.
- 다음 provider cohort는 새 정책 배포 후 exact eligible 후보와 backfill provenance를 읽기 전용으로 확인한 뒤 별도 bounded 요청 예산으로 진행한다.

