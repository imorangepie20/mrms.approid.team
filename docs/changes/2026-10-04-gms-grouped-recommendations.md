# GMS 추천 그룹 통합 UI·UX

후속 사용자 요청으로 `d7fd609` 커밋·푸시와 034/Web 운영 배포를 완료했다. 아래는 배포 전 구현·검증 기록이며 최신 운영 증거는 [배포 결과](2026-10-04-gms-grouped-deploy.md)에 있다.

## 변경 이유·동작

사용자 요청에 따라 `추천 이력 보기` 링크를 없애고 `/gms`에서 현재·지난 추천 전체를 최신 회차순으로 표시한다. `/gms/history`는 `/gms`로 이동한다. 조회의 10회/24회 제한 없이 전체 그룹을 반환하고 각 그룹에 날짜·표시 곡 수·현재/지난 상태와 그룹 삭제를 표시한다. 추천 알고리즘 내부 이름은 화면에서 제거했다.

기존 `RecommendationHistoryList`·`TrackList`·템플릿 확인창을 재사용한다. 모든 트랙에 제거 버튼이 있으며 선택 삭제도 유지한다. 그룹 삭제는 빈 그룹에도 가능하고 서버 SQL 한 번으로 그룹·트랙 숨김을 함께 저장한다. 확인 취소에는 DELETE가 나가지 않으며 실패는 목록을 유지한다. 처리 중 제거·결정·새 추천의 충돌을 막는다. 모바일 트랙 작업 버튼은 최소 44px 높이를 사용한다.

수락·싫어요를 처리해도 추천 그룹에서 트랙을 유지하며 `MMS로 보냄`·`싫어요` 상태를 표시한다. 지난 그룹의 미결정 곡도 결정할 수 있으며 추천 당시 `profileVersion`과 트랙의 ranking/reason/score를 전송한다. +MMS 성공·부분 성공 알림과 MMS 링크를 유지한다.

좋아요는 그룹 내 트랙·컴팩트/전체 플레이어에서 기존 `LikesProvider`·`trackLikeItem`의 TIDAL ID를 공유한다. 동일 트랙의 네 하트에서 낙관적 변경·pending·실패 복원·취소가 함께 반영되는 실제 컴포넌트 회귀를 추가했고 동시에 들어온 요청도 ref 잠금으로 중복 저장을 막는다.

## 데이터 정책·적용 범위

- 트랙·그룹 제거는 GMS 표시 숨김이다. 싫어요 결정과 구분한다. MMS에 저장한 곡·좋아요·추천 batch snapshot·exposure·결정·EMS 원본을 삭제하지 않는다.
- `034_recommendation_history_hidden_batches.sql`은 batch FK와 기본키를 가진 tombstone table만 추가한다. 사용자 소유권을 batch/user join으로 검사하고 중복 요청은 멱등 처리한다. rollback은 이 table만 제거한다.
- 숨긴 current batch는 유지한다. 새로고침은 다시 노출하거나 새 추천을 자동 생성하지 않으며 `다시 추천 받기`로만 다음 batch를 만든다. 노출된 곡의 영구 재추천 제외와 사용자별 싫어요 정책을 유지한다.
- 이번 변경은 로컬 구현이다. 운영 migration·배포·실사용자 데이터 변경·커밋/푸시는 수행하지 않았다. 운영 적용 시 034 migration을 Web release보다 먼저 적용해야 한다.

## 검증 기록

최종 검증 결과는 아래 완료 체크에 기록한다. 초기 회귀에서 추가 테스트가 기존 describe 밖에 배치돼 setup/reset을 상속하지 않은 문제를 찾아 테스트 범위를 수정했다. 격리 DB 회귀의 `import.meta.url`이 Vitest에서 다른 경로로 변환돼 migration fixture 로딩이 실패했으며 기존 migration test와 같은 `process.cwd()` 기준으로 수정했다. 기능 검증을 우회하거나 제품 오류를 테스트로 숨기지 않았다.

브라우저 검증은 운영 계정 없이 실제 `MusicDashboard`·그룹 목록·좋아요/재생 provider·플레이어를 로컬 bundle로 렌더했다. Next navigation/image wrapper와 서버 응답/오디오 engine만 fixture를 사용했고 production build CSS를 재사용했다. 브라우저 저장 경로 제한으로 screenshot 응답을 받아 workspace 밖 검증 폴더에 보관했다. fixture의 font 404는 build font 파일을 fixture에 복사해 해결했다.

## 완료 체크

1. PASS — `app/gms/page.test.tsx` 5개·`app/gms/history/page.test.tsx` 1개·`lib/db/gms-recommendation-batches.test.ts` 13개 통과. `loads more than 24 groups without pagination and excludes hidden groups in SQL`에서 25개 전체 조회·소유 사용자 매개변수·최신순 SQL·숨김 제외를 확인했다. 비회원·재연결 상태는 개인 조회 0회이며 옛 경로는 `/gms`로 redirect한다.
2. PASS — `recommendation-history-list.test.tsx` 16개·`gms-functional-review.test.tsx` 9개·history API 7개 통과. 개별/선택/그룹 삭제·취소·실패/재시도·중복 차단·빈 그룹·원본 profileVersion 전달·저장/부분 성공·MMS 알림을 검증했다.
3. PASS — `GMS_GROUP_TEST_DATABASE_URL`을 전용 `music-pie-gms-groups-20261004` PostgreSQL에 연결해 `gms-grouped-recommendations.postgres.test.ts` 3개 통과·skip 0·exit 0. 034 apply/down/reapply, 타 사용자 제거 거절, 멱등 제거, 숨긴 current batch ID 유지, batch JSON·exposure 2건·결정 1건의 정확한 전후 일치와 다른 사용자 빈 그룹 보존/제거를 확인했다. 테스트 private schema를 정리했다.
4. PASS — `persistent-player.test.tsx` 12개·`likes-provider.test.tsx` 4개 통과. `synchronizes GMS groups and both players by TIDAL ID, including pending and rollback`은 서로 다른 EMS ID/같은 TIDAL ID의 그룹 2개·플레이어 2개 하트 동기화와 단일 PUT·실패 복원·DELETE를 확인했다.
5. PASS — 최종 `npm test -- --maxWorkers=2`는 150파일 중 146파일 통과·4파일 조건부 skip, 616개 중 610개 통과·6개 조건부 skip·exit 0(323.30초). `npm run lint` exit 0·오류 0·기존 경고 8개. `npm run build` exit 0·TypeScript와 53개 page 생성 통과. `git diff --check` exit 0. 요청 범위의 코드·migration·문서를 검토했고 기존 사용자 문서 변경은 보존했다.
6. PASS — 로컬 `http://127.0.0.1:4174/` 실제 컴포넌트에서 desktop 1440×1000·mobile 390×844, 2개 그룹·4개 개별 제거 버튼·가로 overflow false를 확인했다. 모바일 모든 작업 버튼 height ≥44px·actionsFit true. 그룹 확인창은 x16/y267/w358/h310으로 화면 안에 있으며 취소 기본 포커스 → Tab 삭제 → Tab 취소 → Escape 닫기·trigger 포커스/scroll 복귀·DELETE 0건·그룹 2개 유지. 최종 console error/warning 0개. 화면은 workspace 밖 `C:/Users/jowoo/.codex/visualizations/2026/10/03/01a10410-297d-71a0-8892-edc21df8192f/gms-groups/desktop.png`(431,604bytes)·`mobile.png`(215,718bytes)에 저장했다.

## 별도 미검증·다음 작업

- 운영 배포와 운영 로그인 계정의 실제 저장·TIDAL 재생은 이 작업 범위 밖이며 실행하지 않았다.
- 390×844 Chrome viewport를 사용하며 실제 iOS/Android 기기와 Safari/Firefox는 실행하지 않았다.
- 전체 Web test의 기존 조건부 6개는 `RECOMMENDATION_SHADOW_TEST_DATABASE_URL`, `AUDIO_TASTE_PROFILE_TEST_DATABASE_URL`, `AUDIO_ANALYSIS_TEST_DATABASE_URL`이 없어서 skip됐다 (`accepted-recommendations.postgres.test.ts`, `gms-recommendations.postgres.test.ts`, `audio-taste-profiles.postgres.test.ts`, `audio-analysis/admin.postgres.test.ts`). 이번 GMS 격리 PostgreSQL 3개는 실행했고 필수 UI/API/repository 회귀에는 skip이 없다.
- 다음 작업은 요청 시 034 운영 migration·Web 배포 후 로그인 GMS 조회·제거·MMS/좋아요 보존을 확인하는 것이다.

임시 HTTP server를 종료하고 검증 Chrome 탭을 닫았다. 정확한 이름의 검증 DB container를 `docker stop music-pie-gms-groups-20261004`로 종료했으며 `--rm`으로 제거된다. screenshot과 재현 fixture만 위 workspace 밖 검증 폴더에 보관했다. 문서 링크 존재 검사와 최종 `git diff --check`도 exit 0이다.
