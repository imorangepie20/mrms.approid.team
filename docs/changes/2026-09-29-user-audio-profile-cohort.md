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

- 실행 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-user-audio-profile-20260929-102457.dump`를 만들고 PostgreSQL 컨테이너의 `pg_restore --list`로 판독했다. 크기는 176,998,874바이트, SHA-256은 `f7639d2064e60cf4635e987fdb33eafc985b3edf4c0e511460214339553023d1`이다.
- 운영 대상은 읽기 전용 조회로 확인한 eligible 6곡이다. 모두 active·numeric TIDAL ID이고 실행 전 audio job이 없었다.
- 새 EMS CLI를 `--stage-limit 6 --batch-size 1 --max-batches 6 --request-budget 13`과 정확한 6개 `--track-id`로 실행했다. 결과는 staged 6, claimed 6, analyzed 6, requests used 13이며 reused·retryable·failed·released는 모두 0이다.
- 실행 중 audio-analysis는 약 1.96 GiB/3 GiB, CPU 약 100%였고 concurrency 1을 유지했다. 완료 뒤 전체 audio job은 completed 15건이며 다른 상태는 0건이다.
- 6곡 모두 30초·16 kHz·1 channel·3 segment·coverage 1.0, `essentia-dsp-v1`, `essentia/discogs-maest-30s-pw-519l@2`, 2,304차원 L2 embedding이다. 각 곡의 MusicNN high-level prediction은 revision 1·vocabulary 2에서 18/18 label이다.
- GMS의 인증된 본인 갱신 버튼에서 `6/6곡 반영 완료`를 확인했다. DB profile은 `completed`, eligible/analyzed 6/6, coverage 1.0, `audio-taste-v1`, global centroid 1개·2,304차원이다.
- 새 profile을 참조한 자연 GMS shadow run 1건이 생성됐다. 후보 60곡의 audio·mood·rhythm coverage는 아직 0이라 requested/served 모두 `baseline`, fallback은 `ranking_disabled`다. 후보 카탈로그 분석을 확대하지 않았으며 hybrid 환경 변수 세 개는 모두 미설정이다.
- 최종 release는 `/home/approid/apps/music-pie/releases/5d72f07`이다. archive SHA-256은 `bf1e022aee7f760dce626793ff9a8b8fa0d5b3001f993bb0ff2f27fc7ea683f1`이다.
- Web image는 `sha256:1f28dd3283949b3e6def8d63378b5ed9dcd580551797d5e8836d47bbd1c24b21`, container는 `ca75cc684b99`다. 직전 Web rollback image `music-pie-web:pre-5d72f07`은 `sha256:e1368eeb7a44bd2f93ea3c854551ae9d7c9f46f6edc676d996b6f2606a57ef52`다.
- EMS image는 `sha256:94ebc1d89f7585f2d91f1a0fdbe132bacd2a991237259c4fba209bd929fd9e69`, container는 `92be15609fb9`다. EMS rollback image `music-pie-ems-pipeline:pre-b4f48dd`는 `sha256:479e225686421fb401e9a902485b10bffe8da4c070ee614ad2024c32b2bc594d`다.
- Web·EMS·audio-analysis·PostgreSQL은 healthy다. 내부와 공개 ready·Home·EMS·GMS·Search는 모두 HTTP 200이고, 비인증 recommendation과 audio-profile POST는 HTTP 401이다. 배포 뒤 Web 오류 로그와 EMS 오류 로그는 없다.

## 미검증 항목과 다음 작업

- 실제 shadow cohort가 없으므로 activation threshold, allowlist, 보관 기간과 자동 정리 정책은 확정하지 않았다.
- 현재 자연 shadow의 후보 audio coverage는 0이다. 다음 단계는 profile 입력이 아닌 추천 후보 카탈로그의 bounded audio cohort를 별도 설계하고, 실제 audio component가 있는 shadow가 쌓인 뒤 baseline 대비 순위 변화를 검토하는 것이다.
