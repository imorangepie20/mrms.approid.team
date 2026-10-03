# GMS 기능 계약 수정 계획

## 목표·설계

사용자의 수정 요청으로 앞선 재점검에서 확인한 결정 동기화·수락 곡 MMS 조회·모바일 이력 표시를 수정한다.

- 결정은 저장 성공 뒤만 로컬 preference·행·대기 수를 갱신한다. 저장 실패는 행을 유지하고 오류를 표시한다. `decisionSaved:true` 부분 성공은 행을 제거하되 취향 갱신 실패를 알린다. 같은 곡 처리 중 상충 요청과 새 batch 요청을 막고 완료 뒤 서버 route를 갱신한다.
- 수락은 기존 `user_recommendation_decisions`를 영속 근거로 MMS의 별도 `수락한 추천` 섹션에서 조회한다. 하트·내부 playlist를 자동 생성하지 않는다. 사용자별 조회, 영구 reject 제외, EMS 원본 보존을 유지한다. schema·기존 결정 데이터의 변환은 필요 없다.
- 공통 TrackList에 선택적 모바일 행 배치를 추가하고 이력·수락 곡 목록에 사용한다. 모바일은 곡명과 작업 버튼을 별도 줄에 두고 desktop table은 유지한다.
- 운영 배포·실계정 데이터 변경은 이번 로컬 수정 범위에 포함하지 않는다.

## 의존 순서·변경 파일

1. 실패 재현 테스트를 정식 회귀로 추가한다.
2. `music-dashboard.tsx`: 결정 처리/동기화·중복 차단과 MMS prop 연결.
3. `db/gms-recommendations.ts`, `app/mms/page.tsx`, `mms-library.tsx`: 수락 조회와 별도 MMS 목록.
4. `track-list.tsx`, `app/styles/responsive.css`, `recommendation-history-list.tsx`: 모바일 배치와 keyboard 확인.
5. 격리 DB 통합·전체 회귀·local browser 확인 후 변경 기록을 작성한다.

## 객관적 완료 체크

1. 결정 UI: HTTP/network 실패·성공 행/대기 수·부분 성공·중복/상충 요청·batch 이동을 회귀 테스트로 검증한다.
2. MMS 영속 조회: page/repository/UI 및 격리 DB에서 수락 표시·중복 제거·사용자 격리·reject 영구 제외·하트 분리를 검증한다.
3. 모바일·keyboard: 실제 수정 컴포넌트의 local browser 390×844에서 제목 공간·action 잘림·가로 overflow·Tab 조작을 확인한다.
4. 추천 회귀: GMS API·batch·history·hybrid gate·좋아요/playlist 테스트를 실행한다.
5. 정적·전체 검증: Web 전체 test·lint·production build·diff check를 통과한다.
6. 경계·정리: diff에 제품 요청 범위 밖 변경·비밀값이 없는지 검토하고, 격리 DB와 임시 browser harness를 정리한다.

완료는 6개 모두 PASS인 경우만 보고한다. 미검증 운영 배포·실계정 조작은 별도 명시한다.

## 실행 결과

6개 체크 모두 PASS. 명령·테스트 수·브라우저 증거와 적용 범위는 [변경 기록](../changes/2026-10-03-gms-functional-fixes.md)에 기록했다. 로컬 구현이며 운영 미배포다.
