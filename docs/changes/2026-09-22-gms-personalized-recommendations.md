# GMS 개인화 추천 연결

날짜: 2026-09-22

## 변경 이유

GMS가 임시 fixture 목록을 보여주고 있어 사용자별 취향 프로필과 EMS 공용 카탈로그가 실제 추천에 연결되지 않았다. 기존 설계의 `ems-v1` 점수와 사용자별 제외 경계를 Web 런타임에 연결했다.

## 변경 내용

- 완료된 `user_taste_profiles`와 `user_taste_centroids`를 기준으로 EMS 후보를 조회한다.
- 활성 상태·KR `STREAM` 최신 availability·완료된 EMS embedding만 후보로 사용한다.
- 선택 플레이리스트 보유곡, 이미 수락한 곡, 영구 거절한 곡은 사용자별로 제외한다.
- 취향 유사도는 전체 중심 0.3과 가장 가까운 군집 0.7을 결합한다.
- 최종 점수는 `ems-v1`의 취향 유사도 65%, 신뢰도·카탈로그 우선순위 15%, 신규성 10%, 다양성 10%를 사용한다.
- GMS는 실제 EMS `tidal_id`·아트워크를 표시하며, fixture로 대체하지 않는다.
- 취향 프로필은 준비됐지만 필터링 후 후보가 0곡인 경우를 별도 빈 상태로 안내하고 EMS 카탈로그 링크를 제공한다.
- 추천 카드에 서버가 계산한 `taste_match`·`fresh_release` 근거를 각각 `취향 일치`·`최근 발매`로 표시한다.
- 수락·거절은 인증된 사용자 기준으로 `user_recommendation_decisions`에 기록한다.
- 프로필이 없거나 분석이 완료되지 않은 경우 추천 카드를 만들지 않고 온보딩 안내를 표시한다.

## 검증

- `apps/web`: `npm test` — 83개 파일, 331개 테스트 통과
- `apps/web`: `npm run lint` — 오류 0건; 기존 경고 3건 유지
- `apps/web`: `npm run build` — Next.js production build·TypeScript 통과
- 추천 repository·API·GMS 결정 저장 focused 테스트 통과
- GMS 빈 후보 상태 UI 테스트 포함: 전체 Web 83개 파일, 332개 테스트 통과
- 추천 근거 라벨 회귀 포함: 전체 Web 83개 파일, 333개 테스트 통과

## Zorin 배포

- Web release/image: `12e4050`
- EMS catalog embedding image: `music-pie-ems-pipeline:b91afce`
- 기존 이미지 rollback tag: `music-pie-web:rollback-before-gms-reasons-20260922`
- `/api/health/ready`: HTTP 200, `{"status":"ready"}`
- 공개 `/gms`: HTTP 200
- 비로그인 `GET /api/recommendations`: HTTP 401
- 비로그인 `POST /api/recommendations/decisions`: HTTP 401
- 운영 `ems_track_embeddings` 배치: active EMS 2,159곡 중 completed 2,159곡
- embedding 입력 원문은 저장하지 않고 model revision·input hash·vector만 기록했다.
- 최신 Web release smoke: `/gms` 200, `/api/health/ready` 200, 비로그인 추천 API 401

## 미검증

- 실제 로그인 계정의 completed taste profile을 사용한 공개 GMS 브라우저 화면은 아직 확인하지 않았다.
- Zorin production에 새 Web image를 배포하고 실제 사용자 추천 후보·결정 저장을 smoke test하지 않았다.
- 현재 운영 DB의 completed taste profile은 0건이므로, 로그인 사용자가 TIDAL 온보딩 분석을 한 번 완료해야 실제 후보 카드가 생성된다.

## 다음 작업

1. 실제 completed profile이 있는 계정으로 GMS 후보·점수·제외 동작을 확인한다.
2. GMS 카드에 추천 이유 문구를 노출할지 UX를 검토한다.
3. 실제 completed profile 계정으로 GMS 후보·결정 저장을 smoke test한다.
