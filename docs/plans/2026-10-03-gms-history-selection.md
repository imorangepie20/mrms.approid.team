# 추천 이력 선택 삭제 계획

## 설계·범위

사용자의 곡별 체크박스·선택 삭제 요청을 기존 운영 추천 이력에 추가한다. 현재 페이지에 표시된 트랙을 batchId:trackId 단위로 선택하고 전체 선택/선택 해제와 선택 수를 제공한다. TrackList의 선택적 첫 열 renderer를 사용해 재생 버튼·좋아요와 선택을 분리한다.

기존 인증·batch 소유권 검사와 숨김 tombstone DELETE API를 그대로 사용한다. 선택 항목을 순서대로 요청하고 성공 항목만 숨겨 선택에서 해제한다. 실패 항목은 선택 상태로 남겨 재시도하며 한 번 확인·한 번 서버 refresh로 마무리한다. 중복/개별 삭제와 체크박스 변경을 처리 중 차단한다. 추천 원본·exposure·결정·MMS·EMS 데이터는 그대로 유지한다.

추가 요청: `+ MMS` 저장 성공에 템플릿 `apps/admin/src/pages/ui/UiModalNotification.tsx`의 성공 토스트 `추가되었습니다`를 띄운다. 저장된 partial 성공도 포함하며 실패·거절에는 뜨지 않는다. 템플릿의 초록색 CheckCircle, 우측 상단 배치, slideIn, 5초 자동 닫기와 X 닫기를 재사용한다. Web 색상 토큰과 mobile 너비·44px 닫기 버튼·role=status·reduced-motion을 적용하고 포커스/scroll을 강제로 바꾸지 않는다. inline 안내와 MMS 이동 링크도 유지한다. 변경 파일에 `music-dashboard.tsx`, `music/mms-added-alert.tsx`와 해당 회귀를 포함한다.

변경 파일은 `components/recommendations/recommendation-history-list.tsx`, 그 테스트, `components/music/track-list.tsx`, `app/styles/responsive.css`와 문서다. API/schema 변경 없이 기존 삭제 경계를 재사용한다. 검증 후 현재 운영 Web만 새 snapshot으로 교체하고 기존 image/current를 rollback 대상으로 보존한다.

## 객관적 완료 체크

추가 요청: 개별·선택 삭제의 native confirm을 같은 템플릿의 Confirm Dialog로 교체한다. 경고 아이콘·원형 배경·본문·구분선·취소/삭제 footer를 재사용하며 곡 수/이름과 다시 추천되지 않는 정책을 안내한다. 취소를 기본 포커스로 하고 Tab/Shift+Tab trap·Escape/배경 취소·scroll 잠금 및 닫기 후 포커스 복구를 확인한다. 확정 전 DELETE 0건을 검증한다. `components/ui/template-confirm-dialog.tsx`를 추가하고 기존 UI 회귀도 실제 확인 버튼을 눌러 검증한다.

1. 선택: 곡별·표시된 곡 전체 선택/해제·선택 수·빈 상태·batch별 동일 ID 분리·keyboard를 테스트한다.
2. 삭제·알림 UI: 확인 취소·여러 곡 성공·부분 실패·network 실패·재시도·중복/개별 삭제 차단·server refresh와 +MMS 알림의 성공/실패/거절/partial 경계를 테스트한다.
3. 데이터 경계: 기존 history DELETE와 batch 저장소 회귀로 인증/소유권/멱등·원본/exposure/결정 보존을 확인한다.
4. 품질: 관련 회귀·Web 전체 test·lint·production build·diff check exit 0.
5. 운영·브라우저·기록: Web만 교체·source digest 일치·readiness 200·비-Web ID 유지, desktop/390×844에서 선택·선택 취소·삭제 확인 취소·overflow/keyboard 확인과 screenshot, 임시 archive 정리·변경 기록. 실제 사용자 이력 삭제는 수행하지 않고 삭제 성공/실패는 자동 회귀로 검증한다.

5개 모두 PASS일 때 완료로 보고하며 조건부 skip·실행하지 않은 운영 실제 삭제는 별도 기록한다.

## 결과

완료 체크 1–5 PASS. 관련 7파일 59개·전체 144파일 575개 통과, 조건부 DB 6개 skip은 별도 기록했다. lint 오류 0·기존 경고 6, 52개 route production build·서버 Docker build·diff check exit 0. `20261003-template-dialog-47a7cd24e18f` 운영 Web 적용 후 source 6/6·archive label 일치, local/public ready 200·healthy·restart 0·비-Web ID 유지, desktop/mobile keyboard·취소와 +MMS 저장/MMS reload를 확인했다. native 검증 단계의 의도치 않은 이력 hide 2건은 정확한 ID/time 검사 transaction으로 복구했고 두 곡 재표시·hide 0건을 확인했다. 세부 증거·첫 실패/수정·별도 미실행 항목은 [변경 기록](../changes/2026-10-03-gms-history-selection.md)에 있다.
