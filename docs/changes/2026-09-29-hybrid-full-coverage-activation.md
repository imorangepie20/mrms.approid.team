# hybrid full coverage 제한 활성화

## 변경 이유

partial audio coverage에서는 분석 완료 여부가 순위 가용성 편향으로 작용했다. eligible 후보 전체를 분석한 동일 snapshot의 full hybrid를 평가하고, 이후 catalog 변동이 생겨도 partial hybrid를 제공하지 않는 gate와 bounded shadow 보관 정책이 필요했다.

## 변경 내용

- candidate audio cohort A·B·C를 bounded provider 요청으로 처리해 최종 자연 shadow의 60곡 모두 exact-version audio·mood·rhythm component를 확보했다.
- serving gate는 completed audio profile뿐 아니라 audio·mood·rhythm coverage가 모두 정확히 1인 경우만 `hybrid-v0`를 허용한다. 한 component라도 미달하면 `component_coverage_incomplete`로 baseline fallback하고 shadow provenance에 저장한다.
- migration 028은 새 fallback reason을 허용하고, 최대 30일·사용자별 최신 100회의 shadow 보관 정책을 위한 preview·prune 함수를 추가한다.
- shadow 저장 transaction은 candidate 저장 뒤 현재 사용자 범위의 오래된 run을 정리한다. candidate는 FK cascade로 함께 삭제하며 recommendation decision·profile·EMS 데이터에는 접근하지 않는다.
- 현재 사용자 한 명만 allowlist하고 minimum coverage 1로 제한 활성화한다. 인증 subject는 운영 비밀 설정에만 두며 저장소에는 남기지 않는다.

## 검증 결과

- cohort A backup은 `/home/approid/apps/music-pie/backups/pre-hybrid-full-a-20260929-145642.dump`, 189,928,196바이트, SHA-256 `0156c893775feb430c897a96986cfefbaef1f1eb52839e2f26126ff5fc8b90a4`다. A는 12곡 중 11곡 완료·1곡 `preview_forbidden`, provider 요청 24회다.
- cohort B backup은 `/home/approid/apps/music-pie/backups/pre-hybrid-full-b-20260929-150212.dump`, 190,744,085바이트, SHA-256 `0130f4143c03f0f30162dc3b1f234390835c317008913204bfcf602d4e9d686d`다. B는 12/12 완료, provider 요청 25회다.
- cohort C backup은 `/home/approid/apps/music-pie/backups/pre-hybrid-full-c-20260929-150737.dump`, 191,638,561바이트, SHA-256 `0346e94f67dd735f196a312a52fce09bc918d5921a795c3cc5fca469ddbd4f82`다. source routine으로 교체된 후보를 포함해 3/3 완료, provider 요청 7회다. 세 backup 모두 `pg_restore --list`를 통과했다.
- 최종 full-coverage shadow: `6b0f8471-0cae-4a4f-a748-e984c080a3a6`, candidate 60, terminal 제외 2, backfill 2, 세 component coverage 1, fallback 후보 0, null component 0.
- full hybrid/text baseline: overlap@K 0.5, 평균 절대 rank displacement 10.966666666666667, 같은 artist 비율 0, Selector 변경 12. hybrid base top 12와 Selector top 12 구성은 같다.
- 임시 PostgreSQL에 migration 28개 전체 적용 성공. 보관 fixture 102건에서 preview 2건, 삭제 2건, 100건 보존을 확인했고 028 down/up도 통과했다.
- Web 핵심 회귀 3개 파일·22개 테스트와 전체 134개 파일·515개 테스트가 통과했다. 조건부 PostgreSQL suite 3개 파일·3개 테스트는 환경 변수 미설정으로 skip됐다.
- ESLint 오류 0, 기존 경고 5개이며 production build·TypeScript·49개 route 생성을 통과했다.

## 운영 배포

- 기능 커밋 `8401f94`를 local `main`에 fast-forward하고 `origin/main`만 push했다. 원격 `codex/anonymous-playback-error`는 `e1bbe73` 그대로 유지했다.
- release archive SHA-256은 `fcdd9648fdea2666c409a239ebdd369fc92a70948df884282fe898b7bfdfdc9b`, Zorin release는 `/home/approid/apps/music-pie/releases/8401f94`다.
- migration 전 custom-format backup `/home/approid/apps/music-pie/backups/pre-028-hybrid-full-20260929-152120.dump`를 만들고 `pg_restore --list`로 판독했다. 크기는 193,423,603바이트, SHA-256은 `56f81f6fc82d7422d7fc4b3d6ee1b825bf12e7071404e5f79de425b3af3126f5`다.
- 운영 migration은 28개로 증가했고 최신 ID는 `028_hybrid_full_coverage_retention.sql`이다. 새 fallback constraint, preview·prune 함수와 cleanup 대상 0건을 확인했다.
- 새 Web image는 `sha256:2b4f8c4afc0ef7db452b8718817493c538cebad52565daeb9a46e1ff4afbfebf`, container는 `a39a0923b586`이고 restart count 0·healthy다. rollback image `music-pie-web:pre-8401f94`는 `sha256:94f08273292b63ed16418674ce55fb8828554bbe81c4dda8e4a7982f484072d8`다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `70208048b7c2`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았다.
- 비밀 설정에는 `GMS_RANKING_VERSION=hybrid-v0`, 현재 subject 한 명의 allowlist, `GMS_HYBRID_MIN_AUDIO_COVERAGE=1`을 적용했다. subject 값은 문서·로그에 노출하지 않았고 container 환경 반영을 별도로 확인했다. 설정 전 `web.env`는 `web.env.pre-8401f94`로 보존했다.
- local/public ready·Home·EMS·GMS·Search는 HTTP 200, 비인증 recommendation API는 HTTP 401이다. 최근 10분 Web 오류 로그는 0건이다.
- 로그인 Chrome에서 `/gms`를 새 탭으로 열어 12곡 렌더링을 확인했다. 추천 결정·좋아요·재생·오디오 profile 갱신은 실행하지 않았다.
- 활성화 shadow `a96ec455-e570-4fc8-8c3e-ea958cf79642`는 candidate 60, 세 component coverage 1, requested/served `hybrid-v0`, fallback null, terminal 제외 2·backfill 2, fallback·미완성·null component 후보 0을 기록했다. 화면 12곡 순서는 저장된 hybrid top 12와 일치한다.
- 보관 정책 preview와 실제 prune 결과는 모두 0건이며 기존·신규 run 10건을 보존했다. 사용자 수는 1명이고 30일 초과 run은 없다.

## 미검증·다음 작업

- 실제 accept·reject label이 없어 ranking 가중치는 변경하지 않았다.
- 다른 사용자 확대는 이번 범위가 아니며 canary 관찰 뒤 별도 결정한다.
- catalog 갱신으로 component coverage가 미달되면 의도대로 baseline fallback하는 운영 provenance를 다음 자연 발생 시 관찰한다. 강제로 후보 상태를 바꾸는 fault injection은 하지 않았다.
