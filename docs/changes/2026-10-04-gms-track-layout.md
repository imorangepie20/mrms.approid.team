# GMS 트랙 정보 압축 회귀 수정

사용자가 첨부한 화면에서 곡명이 몇 글자로 잘리고 `결정 없음`이 세로로 표시됐다. 직전 검증은 페이지 overflow·버튼/확인창과 1440/390 viewport만 확인해 사이드바를 가진 중간 폭의 제목 가독성을 놓쳤다.

`TrackList`의 95% 메타 열과 고정 선택/시간/작업 열의 충돌, viewport 767px에만 의존한 전환이 원인이다. `mobileStacked` 목록의 부모에 named inline-size container를 추가하고 실제 목록 폭 ≤960px이면 정보/작업 두 줄로 표시한다. 넓은 table에서는 제목에 잔여 폭을 배정하고 아티스트·앨범은 각각 16%를 사용한다. 제목 내용도 잔여 공간을 채우며 결정 배지는 한 줄로 유지한다. 작은 화면의 작업 버튼은 wrapping한다. 같은 prop을 쓰는 MMS 수락 목록을 함께 검증했고 일반 TrackList·API·DB·추천/좋아요 동작은 유지한다.

## 객관적 완료 체크

1. PASS — 레이아웃: 운영 변경 전 1000×800에서 table 607.33px·제목 32.75px·상태 높이 66px를 재현했다. 실제 컴포넌트+최종 production CSS fixture의 390/768/1000/1353/1354/1440px와 1440 화면 안의 600px 부모, 총 7조건에서 GMS 두 그룹·MMS 수락 목록 모두 기준을 통과했다. 제목은 390px에서 201px, 1000px에서 491px, 1440px에서 239.97px, 961px table 전환 직후 181.5px다. 상태 19.5px, 버튼 영역/페이지 overflow 0, ≤960px grid·>960px table-row다. 긴 영문·한글 제목을 사용한다.
2. PASS — 기능·품질: TrackList·MMS·추천 그룹·GMS 기능·대시보드·플레이어·좋아요 provider 7파일 72개 통과·skip 0·exit 0(최종 45.28초). Web lint exit 0·오류 0·기존 경고 8, 변경 TSX 직접 ESLint exit 0, production build/TypeScript·53개 page 생성 exit 0. 모바일 취소 기본 포커스→Tab 삭제→Tab 취소→Escape 닫기·그룹 2개 유지·trigger 복귀. 최종 fixture console error 0. diff/문서 검사는 최종 commit 전에 확인한다.
3. PENDING — 이번 변경만 커밋·푸시하고 사용자 문서 hash 13/13·source/revision/archive label·실제 비-Web ID 6/6·rollback을 확인한다.
4. PENDING — 운영 Web healthy·restart 0·ready 200과 동일 1000/390/1440px·전환 경계의 제목/상태/버튼·키보드 취소·오류·문서 결과 push를 확인한다.

초기 레이아웃 점검에서 넓은 table의 제목 영역 확장과 전환 직후 최소 폭이 기준에 못 미쳐 같은 레이아웃 계층에서 보완하고 전체 fixture 조건·관련 회귀·빌드를 다시 실행했다. fixture의 React DevTools production 경고는 fixture bundle을 minify한 뒤 새 탭에서 console error 0으로 확인했다. 브라우저 연결이 끊겨 지침에 따라 연결 가능한 브라우저를 다시 선택했다.

## 증거·미실행

로컬 재현·검증은 저장소 밖 `C:/Users/jowoo/.codex/visualizations/2026/10/03/01a10410-297d-71a0-8892-edc21df8192f/gms-layout/`의 `before.png`·`local-after.png`·`local-results.json`·`keyboard.json`과 실제 컴포넌트 fixture에 있다. Next navigation/image·서버 응답/오디오 engine만 fixture이고 production CSS·GMS/MMS TrackList는 실제 소스를 사용한다.

기존 배포 스크립트의 `--filter label=com.docker.compose.service!=web`는 0행을 반환했다. 이번 배포에서는 project 필터와 `--filter 'label!=com.docker.compose.service=web'`를 사용하고 비교 전후 정확히 6행인지도 검사한다. [이전 기록](2026-10-04-gms-grouped-deploy.md)에 검증 한계를 정정한다.

운영 실제 삭제·수락·좋아요·추천 생성과 TIDAL 재생, 실제 iOS/Android·Safari/Firefox는 이번 CSS 수정 검증에서 실행하지 않는다. DB migration 변경은 없으며 전체 Web/조건부 DB 재실행은 필요 범위의 관련 72개·실제 브라우저·production build로 대체한다.
