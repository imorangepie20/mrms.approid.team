# 추천 이력 선택 삭제·템플릿 알림/확인창 변경

## 요청·구현

곡별 체크박스, 표시된 곡 전체 선택/해제, 선택 수와 선택 삭제를 추가했다. 선택 키는 batchId:trackId이고 재생·좋아요와 분리된다. 기존 history DELETE를 순서대로 호출해 성공 항목만 숨김/선택 해제하고 실패 항목은 선택 상태로 재시도한다. 처리 중 중복 삭제·체크박스를 차단하고 한 번 server refresh한다. schema·API 변경은 없다.

사용자 지시에 따라 `apps/admin/src/pages/ui/UiModalNotification.tsx`의 Notifications Container(27–53행)와 Confirm Dialog(103–130행)를 Web 컴포넌트로 옮겼다. 성공 토스트는 CheckCircle·초록색·우측 상단·slideIn·5초 자동 닫기·X 버튼을 재사용하고 `추가되었습니다`만 표시한다. `+ MMS` 실제 저장 성공과 decisionSaved 부분 성공에만 뜬다. 실패·거절에는 표시하지 않는다. Web 텍스트/표면 토큰·모바일 너비·44px 닫기 버튼·role=status·reduced-motion을 적용했다.

삭제 확인창은 경고 원형 아이콘·본문·구분선·취소/삭제 footer를 재사용한다. 곡 수/이름과 영구 재추천 제외 안내를 표시하고 취소 기본 포커스, Tab/Shift+Tab 순환·Escape/배경 취소·scroll 잠금/복구·포커스 복구를 적용한다. 확정 전 요청이 나가지 않는다.

## 검증 과정·운영 데이터 복구

첫 UI 구현 전 6개 회귀 실패는 완료 체크 1/2의 기능 부재였다. 초기 native 알림 버전 `20261003-history-selection-b85e9a785d3b`를 적용한 뒤 사용자의 커스텀/템플릿 요청으로 교체했다. 이 버전에서 `Catch Me I'm Falling` 수락 1건을 검증해 저장·대기 5→4·MMS 반영을 확인했다. native popup은 브라우저에서 확인하지 못해 통과로 보고하지 않는다.

native 삭제 확인창 검증 중 브라우저 API timeout으로 취소 제어가 막혔다. 사용자에게 취소를 요청했으나 이후 화면에서 `Cornet Chop Suey`·`Fine and Mellow` 2곡 숨김이 관측됐다. 원인을 사용자 조작으로 단정하지 않았다. 01:19:36/37 UTC에 생성된 해당 batch/track의 숨김 기록 2개만 timestamp와 정확한 ID를 검증하는 transaction으로 복구했다. 잔존 hide 0건과 별도 운영 탭의 두 곡 재표시를 확인했다. 원본 track/exposure/decision은 변경하지 않았다. 서버 `shared/artifacts/20261003-history-selection-b85e9a785d3b/history-verification-restoration.txt`에 결과를 기록했다. 이후 실제 삭제 확정 검증은 자동 회귀로 수행한다.

커스텀 확인창 추가 후 첫 전체 실행에서 기존 TrackList 재생 테스트가 병렬 build/test 부하 중 5초 timeout 1건, 테스트의 Testing Library ByRoleOptions에 잘못 넣은 exact 옵션으로 type build 실패가 발생했다. 완료 체크 4의 원인을 조사해 옵션을 제거하고 테스트 동시 worker를 2개로 제한해 전체 검증을 다시 실행했다. 테스트 timeout을 늘리거나 제품 코드를 우회하지 않았다.

## 완료 체크

1. PASS — 곡별/전체 선택·해제·선택 수·batch 분리: recommendation-history-list.test.tsx, 관련 7파일 59개 회귀 exit 0.
2. PASS — 삭제 취소/순차 성공/부분 실패/재시도/network·확정 전 요청 0·중복 차단, 템플릿 확인창 keyboard/focus/scroll, MMS 성공/실패/거절/partial·5초 timer/close: 관련 7파일 59개 exit 0.
3. PASS — history route와 gms-recommendation-batches 2파일 15개 회귀 포함: 인증/소유권/멱등·원본/노출/결정 보존.
4. PASS — `npm test -- --maxWorkers=2`: 144파일 575개 통과·6개 조건부 skip, exit 0. `npm run lint`: 오류 0·기존 경고 6, exit 0. `npm run build`: TypeScript·52개 route, exit 0. 서버 Docker build와 `git diff --check` exit 0. 관련 7파일 59개도 최종 재검증 exit 0.
5. PASS — 아래 운영 적용과 브라우저 검증, source 파일 6/6 SHA 일치·archive label 일치·local/public readiness 200·비-Web container ID 동일·임시 파일 정리와 문서 기록을 확인했다.

## 운영 적용·브라우저

- release: `20261003-template-dialog-47a7cd24e18f`, source archive 756파일·6,392,320bytes, SHA-256 `47a7cd24e18f645cc812c5c5926cbec851573e6f9c1ad0180ea54567d87e346d`.
- Web image: `sha256:28b86b8978ce7c35958616821b07ca84642c372a1042905ab1137969e897f5e1`, container `d50eefa1a06ae8245aa35cd9bc7b5714a72a222d2e11f62eb0886cd79f4de185`, healthy·restart 0.
- rollback: 직전 release `20261003-history-selection-b85e9a785d3b`, image `sha256:964d51e73275c17b10ab9df11433a50d08a967c5c3b288ae6103d6f7b2c8403d`, tag `music-pie-web:pre-template-dialog-20261003`. 초기 GMS/MMS release와 tag도 보존했다. 기존 runtime env를 그대로 쓰고 migration은 실행하지 않았다.
- 운영 `gms/history`: desktop 곡별 checkbox·Space 선택·선택 2곡과 mixed 전체 선택, alertdialog 곡 수/경고/취소 기본 포커스 확인. Tab 삭제→Tab 취소→Escape 닫기 후 선택 2곡 유지·trigger 포커스·scroll 복구, mobile 390×844 확인창 358×291·viewport 안쪽·overflow false. mobile 취소·개별 곡명 확인창 취소·표시된 곡 전체 선택 20개/해제·0곡 삭제 비활성 확인. 최종 reload에서 20개 이력과 복구한 두 곡 표시 유지.
- `+ MMS`: `Come Rain or Shine` 수락 1건에서 role=status `추가되었습니다`, mobile toast bounds x181.30/y80/w182.70/h54·overflow false, 대기 4→3을 확인했다. 5초 후 toast 0개, MMS 이동 후 해당 곡 1개·reload 후 1개로 저장 유지 확인. 이 작업의 실제 수락 검증 총 2건(Catch Me I'm Falling 포함)은 사용자 취향에 반영된다.
- screenshot은 workspace 밖 `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/gms-history-selection/`에 보관한다. `confirm-desktop.png`·`confirm-mobile-final.png`는 템플릿 확인창, `history-mobile-selected.png`는 체크박스 목록 증거다. 첫 mobile/toast screenshot은 compositor의 이전 프레임을 담아 해당 UI 증거로 사용하지 않았다. live DOM 상태와 자동 회귀를 별도로 확인했다.
- 운영 scripts·nonweb-before/after·rollback과 복구 결과는 서버 `shared/artifacts/`에 보관하고 source archive는 정리했다. Git commit/push는 수행하지 않았다.

## 별도 미실행 항목

- 전체 테스트의 PostgreSQL 조건부 6개는 로컬의 `RECOMMENDATION_SHADOW_TEST_DATABASE_URL`, `AUDIO_TASTE_PROFILE_TEST_DATABASE_URL`, `AUDIO_ANALYSIS_TEST_DATABASE_URL` 미설정으로 skip됐다. 필수 UI/API/repository mock 회귀에는 skip이 없다. API/schema 변화가 없어 이 작업에서 별도 DB fixture를 다시 만들지 않았다. 이전 GMS 작업의 격리 PostgreSQL 5개 통과는 해당 기록에 한정한다.
- 최종 커스텀 확인창의 운영 실제 삭제 확정은 수행하지 않았다. 기존 native 단계의 의도치 않은 hide 2건은 위 transaction으로 복구했고, 최종 삭제 성공·실패·부분 실패는 자동 회귀로 검증했다.
