# GMS 결정·MMS·모바일 이력 수정

후속 상태: 아래는 로컬 수정 당시 기록이다. 사용자의 운영 사이트 재신고 후 [운영 적용·실제 클릭 검증](2026-10-03-gms-production-accept.md)을 완료했다.

## 변경 이유와 범위

2026-10-03 재점검의 결함 세 가지를 사용자 `수정해` 요청에 따라 로컬 수정했다. [계획](../plans/2026-10-03-gms-functional-fixes.md)의 6개 체크를 적용한다. 기존 사용자 변경과 앞선 점검 기록을 보존했다. 운영 배포·실계정 데이터 변경은 수행하지 않았다.

## 구현

- `apps/web/src/components/dashboard/music-dashboard.tsx:78`: 결정 API의 응답을 기다린 뒤 성공한 곡만 preference와 대기 목록에서 반영한다. HTTP/network 실패는 행을 유지하고 재시도 안내를 표시한다. `503`의 `decisionSaved:true`는 저장 완료로 반영하면서 취향 갱신 실패를 안내한다. 처리 중 결정·새 batch 버튼을 막고 서버 route를 갱신한다.
- `apps/web/src/lib/db/gms-recommendations.ts:884`, `apps/web/src/app/mms/page.tsx:30`, `apps/web/src/components/music/mms-library.tsx:350`: 기존 수락 결정의 active EMS 트랙을 MMS `수락한 추천`으로 조회한다. 사용자별 중복을 제거하고 해당 사용자에게 reject 이력이 있으면 이후 accept가 있어도 제외한다. 최신 KR STREAM availability로 재생 가능 여부를 표시한다. 수락은 하트·내부 playlist를 자동 생성하지 않는다. schema·migration 추가는 없다.
- `apps/web/src/components/music/track-list.tsx:51`, `apps/web/src/components/recommendations/recommendation-history-list.tsx:76`, `apps/web/src/app/styles/responsive.css:415`: 이력과 수락 목록에서만 모바일 행 배치를 선택 적용한다. 곡명·아티스트·앨범·상태와 작업 버튼을 두 줄로 배치하며 desktop table을 유지한다.

## 검증 명령과 결과

아래 npm 명령의 작업 디렉터리는 `apps/web`다.

1. `npm test -- src/components/dashboard/gms-functional-review.test.tsx src/components/dashboard/music-dashboard.test.tsx src/components/recommendations/recommendation-history-list.test.tsx src/components/music/mms-library.test.tsx src/app/mms/page.test.tsx`: 5개 파일·36개 테스트 PASS, exit 0. 첫 실행에서 기존 MMS heading 기대값 2개가 새 섹션과 달라 실패했고 기대 계약을 수정한 뒤 해당 전체 세트를 재실행했다.
2. 격리 Docker PostgreSQL에 `node scripts/migrate.mjs`: 31개 migration 적용, exit 0. `RECOMMENDATION_SHADOW_TEST_DATABASE_URL`과 `AUDIO_TASTE_PROFILE_TEST_DATABASE_URL`을 해당 임시 DB로 지정한 `npm test -- src/lib/db/gms-recommendations.postgres.test.ts src/lib/db/audio-taste-profiles.postgres.test.ts src/lib/db/accepted-recommendations.postgres.test.ts`: 3개 파일·5개 테스트 PASS, skip 0, exit 0. 수락 중복·사용자 분리·영구 reject·EMS 보존·하트 분리·최신 availability를 실제 SQL로 검증했다.
3. `npm test`: 143개 파일 통과·4개 파일 조건부 skip, 561개 테스트 통과·6개 skip, exit 0. GMS API/결정/refresh/history/audio-profile, 후보·filter·selector·hybrid serving, 좋아요·playlist·music session 회귀를 포함한다. 로그: `%TEMP%/music-pie-gms-fixes-full-test.log`.
4. `npm run lint`: exit 0, 오류 0·기존 경고 6. `npm run build`: exit 0, TypeScript와 52개 route production build 통과.
5. Chrome의 실제 수정 컴포넌트와 CSS를 사용하는 로컬 fixture에서 HTTP 실패 후 2행 유지, 성공 후 대기 수 1, 부분 성공 후 대기 수 0과 안내를 확인했다. MMS는 수락 1곡·좋아요 0곡으로 분리 표시했다. fixture의 fetch·session·navigation은 모의 구현이므로 실제 Next 인증/서버 왕복을 의미하지 않는다. 영속 저장·조회는 2번 DB 테스트로 별도 확인했다.

브라우저 증거 디렉터리: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/gms-fixes`.

- `history-mobile-fixed.png`: 390×844에서 play button 288px, 제목 공간 232px(수정 전 약 39.69px), 가로 overflow 없음·화면 밖 작업 버튼 0개. 재생 버튼에서 Tab으로 playlist 추가 버튼에 이동했다.
- `history-desktop-fixed.png`: table header 표시 유지.
- `gms-save-failure.png`, `gms-partial-success.png`, `mms-accepted-fixed.png`: 실패·부분 성공·MMS 표시.
- `browser-verification.json`: 위 관찰 수치와 console 오류 0·경고 0, viewport 복원을 기록했다. 임시 탭은 닫았다.

## 완료 체크

- PASS — 결정 UI: `gms-functional-review.test.tsx` 6개 회귀와 local fixture 실패·성공·부분 성공 관찰.
- PASS — MMS 영속 조회: page/UI 테스트와 `accepted-recommendations.postgres.test.ts` 3개 실 DB 테스트, 통합 세트 총 5개 통과.
- PASS — 모바일·keyboard: `history-mobile-fixed.png`, `browser-verification.json`의 390×844·제목 232px·overflow 없음·Tab 이동; desktop header 유지.
- PASS — 추천 회귀: Web 전체 561개 통과에 GMS API·batch·history·hybrid·좋아요·playlist 테스트 포함, 별도 GMS DB 통합 통과.
- PASS — 전체·정적 검증: test/lint/build/diff check exit 0; 561개 통과·lint 오류 0·52개 route.
- PASS — 경계·정리: diff를 수정 범위와 문서에 한정해 검토했으며 비밀값·DB dump·새 의존성 없음. 이름과 ID를 확인한 임시 DB container 제거, local port 44121 listener 0, 임시 harness 폴더 제거, screenshot 증거만 저장소 밖 보존.

## 미검증·다음 작업

- 운영 배포와 실제 로그인 계정에서 수락·거절·재조회는 이번 로컬 수정 범위에 포함하지 않아 수행하지 않았다. 운영 적용 검증은 남아 있다.
- 전체 기본 테스트에서 환경 조건으로 skip된 6개 중 이번 범위의 PostgreSQL 테스트 5개는 별도 격리 DB 실행으로 통과했다. 나머지 관리자 오디오 품질 DB 테스트 1개는 이번 변경과 무관하며 전용 환경 미지정으로 실행하지 않았다.
- 수락 목록은 현재 active EMS 트랙을 조회한다. inactive 또는 삭제된 EMS 항목을 별도 보관하는 기능은 추가하지 않았다.
