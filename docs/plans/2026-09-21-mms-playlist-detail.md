# MMS 플레이리스트 상세와 큐 재생

## 목표

MMS 플레이리스트 카드에서 저장된 트랙을 순서대로 확인하고 해당 플레이리스트만 전체 재생하거나 셔플한다.

## 변경 파일과 순서

1. `apps/web/src/lib/db/music-library.ts`: 사용자·플레이리스트 소유권으로 범위를 제한한 플레이리스트 트랙 조회를 추가한다.
2. `apps/web/src/app/mms/page.tsx`: 조회 결과를 플레이리스트별 트랙 배열로 묶어 화면에 전달한다.
3. `apps/web/src/components/music/mms-library.tsx`: 카드 버튼, 인라인 상세, 돌아가기, 전체 재생과 셔플을 연결한다.
4. 관련 repository·page·component 테스트와 변경 기록을 갱신한다.

## 완료 기준

- 플레이리스트 트랙은 `user_playlist_tracks.position` 순서를 보존하고 다른 사용자의 데이터가 섞이지 않는다.
- 카드 클릭 시 해당 플레이리스트의 트랙만 표시한다.
- 전체 재생과 셔플은 해당 플레이리스트만 큐로 설정한다.
- 키보드로 카드와 상세 제어를 사용할 수 있다.
- 전체 테스트, ESLint, production build와 UI 검사가 통과한다.
