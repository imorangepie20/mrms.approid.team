# 사용자 audio profile cohort 실행

## 이유

운영 사용자의 eligible EMS 트랙 6곡은 기존 bounded sample cohort와 겹치지 않아 exact-version audio 분석이 0곡이었다. 이 상태에서는 `user_audio_taste_profiles`를 만들 수 없고 hybrid shadow의 실제 audio component도 관측할 수 없다. 기존 `analyze-audio`는 최신 active 트랙을 stage하고 전체 pending job을 claim하므로 특정 사용자의 6곡만 처리한다는 경계를 보장하지 못했다.

## 변경

- `analyze-audio`에 반복 가능한 `--track-id <UUID>`를 추가했다.
- 명시된 UUID allowlist를 job staging과 claim 양쪽에 적용했다. 옵션을 생략하면 기존 bounded 동작을 유지한다.
- 중복 UUID는 제거하고, 잘못된 UUID는 DB 접근 전에 CLI에서 거절한다.
- 인증된 사용자 본인의 `refreshAudioTasteProfile`만 실행하는 `POST /api/recommendations/audio-profile`을 추가했다. 임의 사용자 식별자는 입력받지 않고 내부 오류 세부 정보는 응답하지 않는다.
- GMS에 키보드와 모바일 폭에서 사용할 수 있는 명시적 `오디오 취향 반영` 버튼과 진행·성공·실패 상태를 추가했다.
- 단계 6.1 실행 경계와 main-only push 정책을 구현 계획에 기록했다.

## 검증

- `services/ems-pipeline`: `python -m pytest -q` — 78 passed
- `apps/web`: `npm test` — 132 files passed, 3 skipped; 505 tests passed, 3 skipped
- `apps/web`: `npx tsc --noEmit` — 성공
- `apps/web`: `npm run lint` — 오류 0, 기존 경고 5
- `apps/web`: `npm run build` — 성공, 49 routes
- `git diff --check` — whitespace 오류 없음

## 운영 실행 결과

배포·bounded 분석·profile refresh 결과는 실행 후 이 절에 추가한다. 검증 전에는 hybrid serving 환경 변수를 설정하지 않는다.

## 미검증 항목과 다음 작업

- 운영 6곡 분석과 profile refresh는 아직 실행하지 않았다.
- 실제 shadow cohort가 없으므로 activation threshold, allowlist, 보관 기간과 자동 정리 정책은 확정하지 않았다.
- 자연 GMS 요청으로 shadow row가 쌓인 뒤 component coverage와 baseline 대비 순위 변화를 검토한다.
