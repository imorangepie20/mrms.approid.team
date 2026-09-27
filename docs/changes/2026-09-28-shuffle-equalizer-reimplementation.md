# 셔플 재생·비주얼 이퀄라이저 재구현

## 이유

앨범·플레이리스트 셔플은 컴포넌트에서 배열을 직접 섞은 뒤 `setQueue`와 `playTrack`을 따로 호출해 재생 가능한 첫 곡, 셔플 표시와 실제 큐를 하나의 상태 전이로 보장하지 못했다. EQ는 실제 신호를 읽고 있었지만 저역부터 고역을 왼쪽에서 오른쪽으로 나열해 막대가 한쪽으로 쏠려 보였다.

## 변경

- 셔플 큐 생성, 재생 불가 곡 제외, 셔플 상태 설정과 첫 곡 재생을 provider의 `playQueue` 한 동작으로 통합했다.
- 셔플 결과가 원래 순서와 같으면 한 칸 회전해 2곡 이상에서 실제 순서 변화가 보이게 했다.
- 새 일반 큐나 전체 재생을 선택하면 이전 셔플 상태를 해제해 버튼 표시와 큐 순서를 일치시킨다.
- MMS와 검색의 앨범·플레이리스트 전체 재생·셔플 버튼을 `playQueue`에 연결했다.
- EQ의 48개 막대를 중앙 저역·양쪽 고역의 대칭 스펙트럼으로 재구성했다. 넓은 로그 밴드에서 순간 성분이 사라지지 않도록 RMS 에너지를 사용하고 실제 analyser 값만 그린다.

## 검증

- 변경 focused Vitest: 4개 파일, 27개 테스트 통과.
- 전체 Vitest: 101개 파일 중 99개 통과, 397개 중 394개 통과. 기존 likes/recommendations 인증 mock 3건의 `503` 실패가 동일하게 남았다.
- 변경 파일 ESLint: 오류·경고 0건.
- `npm run build`: Next.js production build와 TypeScript 통과.
- `git diff --check`: 통과.
- 배포와 public browser 결과는 완료 후 기록한다.

## 운영 경계

- DB schema와 data write는 없다.
- 사용자 데이터, TIDAL 연결 정보, active EMS catalog와 상시 worker를 변경하지 않는다.
- 비밀값, token, cookie, signed URL과 raw query를 출력하거나 기록하지 않는다.
