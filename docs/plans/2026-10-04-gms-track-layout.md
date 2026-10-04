# GMS 트랙 정보 압축 회귀 수정

## 원인·범위·순서

사용자 screenshot에서 GMS 트랙명/결정 상태가 과도하게 잘리는 문제를 운영 Chrome 1000×800에서 재현했다. 목록 607.33px·제목 32.75px·상태 66px 높이다. `TrackList`는 제목/아티스트/앨범 95%와 고정 선택/시간/작업 열을 동시에 지정하고, 반응형 전환을 viewport 767px에만 적용한다. 사이드바가 있는 중간 화면에서는 목록 실제 폭이 더 좁다.

공유 `mobileStacked` 목록을 실제 container 폭 960px 이하에서 정보/작업 두 줄로 전환한다. 해당 목록의 넓은 table은 제목에 잔여 폭을 배정하고 아티스트/앨범을 각 16%로 제한한다. 상태는 한 줄로 유지하고 작업 버튼은 부족한 폭에서 wrapping한다. GMS와 같은 prop을 사용하는 MMS 수락 목록도 검증한다. 다른 table·API·DB·추천/좋아요 상태 로직은 수정하지 않는다.

컴포넌트/CSS 수정 → 관련 회귀·lint/build → 실제 production CSS/컴포넌트의 작은 container·1000/1440/390 화면과 키보드 검증 → 기존 승인 범위의 commit/push·Web만 배포 → 운영 동일 폭 검증·기록 순서다. 사용자 문서 13개와 비-Web container를 보존한다. migration 변경은 없다.

## 객관적 완료 체크 (4개)

1. 레이아웃: 변경 전 1000px 재현값을 기록하고, 변경 후 실제 컴포넌트에서 container ≤960px는 grid·>960px는 table-row, 제목 폭 desktop ≥160px/mobile ≥120px, 상태 높이 ≤24px·버튼 overflow 0·페이지 가로 넘침 0을 확인한다. 390·768·1000·1440px와 넓은 화면 안의 600px container를 포함한다.
2. 기능·품질: TrackList·GMS 그룹·플레이어/좋아요·MMS 관련 회귀, lint·production build·diff 검사 exit 0. 키보드 그룹 확인 취소/포커스 복귀와 직접 파일 변경 범위를 검토한다.
3. Git·보존: 이번 파일만 commit/push exit 0·HEAD=origin/main=remote main, 기존 사용자 문서 hash 13/13 보존, 서버 source/revision/archive label 일치·비-Web ID 6/6 동일·rollback 보존.
4. 운영·기록: Web healthy·restart 0·내부/공개 ready 200, 로그인 GMS 동일 viewport/container 기준의 제목·상태·버튼 영역 및 삭제 확인 취소·오류 0, 문서 링크 검사·결과 문서 push 확인.

실제 저장·삭제·좋아요·추천 생성과 TIDAL 재생, 실제 iOS/Android·Safari/Firefox는 별도 미실행 항목으로 기록한다. 첫 검증 pass의 실패/미검증이 2개를 넘으면 개별 증상을 고치지 않고 원인 계층을 보고한다.
