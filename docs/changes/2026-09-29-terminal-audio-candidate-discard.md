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

## 운영 배포

- 기능 커밋 `f2aeac4`를 local `main`에 fast-forward하고 `origin/main`만 push했다. 원격 `codex/anonymous-playback-error`는 `e1bbe73` 그대로 유지했다.
- release archive SHA-256은 `8721be59c93f8efe6ee6213740785edb0a2d2f19df7f03cf6fc1bb733b5df7aa`, Zorin release는 `/home/approid/apps/music-pie/releases/f2aeac4`다.
- migration 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-027-terminal-audio-20260929-143907.dump`를 만들고 `pg_restore --list`로 판독했다. 크기는 187,775,595바이트, SHA-256은 `82bda4a65f5db389c5c62eaf53637015a16201c7e393ab3a48e71aed3772bef2`다.
- 운영 migration은 27개로 증가했고 최신 ID는 `027_terminal_audio_candidate_provenance.sql`이다. 새 provenance 열 4개를 확인했다.
- 새 Web image는 `sha256:94f08273292b63ed16418674ce55fb8828554bbe81c4dda8e4a7982f484072d8`, container는 `58b7899f440d`다. 새 EMS image는 `sha256:801b7b4cf308ec437838a3f0828a8b2fd16c488e482b0818d5935e399aaea6d6`, container는 `70208048b7c2`다. rollback image는 각각 `music-pie-web:pre-f2aeac4`, `music-pie-ems-pipeline:pre-f2aeac4`로 보존했다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았다.
- Web·EMS는 healthy다. local live·ready·Home·EMS·GMS·Search와 public ready·Home·EMS·GMS·Search는 HTTP 200, 비인증 recommendation API는 HTTP 401이다. 최근 5분 Web·EMS 오류 로그는 0건이다.
- 세 hybrid 환경 변수는 모두 미설정이다. 기존 실패 행은 `failed|preview_info_rejected`를 유지하며 새 호환 terminal 집합에서 제외 대상으로 판정되는 것을 읽기 전용으로 확인했다.

## 미검증·다음 작업

- 로그인된 자연 GMS 요청으로 기존 `preview_info_rejected` 행의 제외·backfill provenance가 새 shadow에 저장되는 과정은 아직 확인하지 않았다.
- 이 정책은 후보 집합을 정규화할 뿐 partial coverage activation을 허용하지 않는다. hybrid 환경 변수는 계속 미설정으로 두고 full eligible coverage gate와 실제 순위 지표를 별도로 확인한다.
- 다음 provider cohort는 새 정책 배포 후 exact eligible 후보와 backfill provenance를 읽기 전용으로 확인한 뒤 별도 bounded 요청 예산으로 진행한다.

