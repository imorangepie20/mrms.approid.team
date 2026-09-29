# terminal audio 후보 제외 계획

## 목적

TIDAL preview가 트랙 단위로 영구 거부되거나 제공되지 않는 경우 해당 트랙을 EMS 원본 카탈로그와 baseline 추천에서는 유지하되, audio/hybrid 후보 집합에서는 제외한다. 제외로 비는 자리는 동일한 text 후보 순서의 다음 정상 트랙으로 보충한다.

## 설계

- `403` playback-info 응답을 `preview_forbidden` terminal 오류로 별도 분류한다.
- 기존에 같은 상황으로 저장된 `preview_info_rejected`와 `preview_unavailable`은 호환 terminal 코드로 취급한다.
- 추천 후보 조회는 기존 baseline pool과 terminal 제외 후 동일 크기로 보충한 hybrid pool을 함께 만든다.
- 실제 제공 baseline은 기존 pool만 사용해 결과를 바꾸지 않는다.
- shadow 비교는 terminal 제외·보충 후의 text baseline과 hybrid ranking을 같은 후보 집합에서 비교한다.
- shadow run에는 실제 제공 baseline ID, terminal 제외 트랙과 오류 코드, 보충 트랙 ID를 별도 provenance로 저장한다.
- 제외는 전역 카탈로그 삭제나 사용자 `reject` 결정이 아니며 다른 사용자의 추천 상태를 변경하지 않는다.

## 변경 파일

- `services/ems-pipeline/src/ems_pipeline/audio_analysis.py`
- `services/ems-pipeline/tests/test_audio_analysis.py`
- `apps/web/src/lib/db/gms-recommendations.ts`
- `apps/web/src/lib/db/gms-recommendations.test.ts`
- `apps/web/src/lib/db/migrations/027_terminal_audio_candidate_provenance.sql`
- `apps/web/src/lib/db/migrations/027_terminal_audio_candidate_provenance.down.sql`
- `apps/web/src/lib/db/migrations/027_terminal_audio_candidate_provenance.test.ts`
- 관련 변경 기록과 현재 개발 맥락 문서

## 완료 기준

1. 403 preview-info가 non-retryable `preview_forbidden`으로 저장된다.
2. terminal 트랙은 hybrid 후보에서 빠지고 다음 정상 후보가 같은 크기의 pool을 채운다.
3. baseline 응답은 terminal 트랙 유무와 관계없이 기존 pool 기준으로 유지된다.
4. shadow 저장에서 제공 baseline, 제외 사유, 보충 트랙을 구분해 재현할 수 있다.
5. EMS 단위 테스트, Web 추천·migration 테스트, Web 타입·lint·build 검사가 성공한다.

