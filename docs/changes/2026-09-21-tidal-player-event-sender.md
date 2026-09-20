# TIDAL 플레이어 이벤트 발신자 초기화

## 변경 이유

실제 계정의 검색 결과에서 재생 버튼을 누르면 Player SDK가 `Playback not allowed without an event sender.`를 반환해 트랙을 불러오지 못했다.

## 변경 내용

- Player SDK 초기화 시 credentials provider와 함께 최소 이벤트 발신자를 먼저 등록한다.
- 이벤트 발신자 없이 `load`가 실패하는 SDK fixture를 추가해 초기화 순서를 회귀 테스트로 고정했다.

## 검증 결과

- 수정 전 신규 테스트가 실제 오류 문구로 실패하는 것을 확인했다.
- `npm test -- src/lib/tidal/player.test.ts`: 5개 테스트 통과
- `npm test`: 40개 파일·120개 테스트 통과
- `npm run lint`: 통과
- `npm run build`: 통과

## 미검증 항목

- 실제 계정의 음원 재생 시작과 재생 위치 증가는 최신 빌드로 서버를 교체한 뒤 Playwright로 확인한다.

## 다음 작업

- 실제 재생에서 추가 SDK 오류가 발생하면 해당 event payload를 fixture로 먼저 고정한다.
