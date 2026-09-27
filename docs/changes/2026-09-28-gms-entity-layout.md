# GMS 엔터티별 레이아웃 변경

## 변경 이유

GMS의 개별 트랙 추천이 큰 카드와 가로 rail로 표시되어 플레이리스트·앨범과 시각적 위계가 같았다. 트랙은 여러 곡을 빠르게 비교하고 판단하는 대상이므로 세로 목록으로 전환한다.

## 변경 내용

- GMS 트랙 카드 rail을 곡명·아티스트·앨범·결정 액션이 구분된 세로 목록으로 교체했다.
- 작은 앨범 아트의 재생 버튼, 추천 수락, 싫어요와 MMS 좋아요를 각 행에 유지했다.
- 트랙을 재생하면 현재 GMS 추천 전체를 대기열로 설정한 뒤 선택 곡을 재생한다.
- 모바일에서는 아티스트와 앨범을 곡명 아래 보조 문구로 합치고 결정 액션을 다음 줄에 배치한다.
- 현재 GMS API는 `Track[]`만 제공하므로 존재하지 않는 앨범·플레이리스트 추천 데이터를 만들지 않았다. 실제 컬렉션 엔터티가 추가될 때는 기존 카드형 표현을 사용한다.

## 검증

- 변경 전 실패 재현: 목록 role과 GMS 대기열 설정 테스트 2건 실패.
- `npm test -- --run src/components/dashboard/music-dashboard.test.tsx`: 9개 통과.
- 변경 파일 ESLint: 오류·경고 0건.
- `npm run build`: Next.js production build와 TypeScript 통과.
- 전체 Vitest: 101개 파일 중 99개, 397개 테스트 중 394개 통과. 기존 인증 mock 관련 3건은 동일하게 실패했다.
- 배포와 public browser 결과는 완료 후 기록한다.

## 운영 경계

- DB schema와 data write는 없다.
- 추천 계산·결정 API, 사용자 데이터와 active EMS catalog를 변경하지 않는다.
- 비밀값, token, cookie, signed URL과 raw query를 출력하거나 기록하지 않는다.

## 롤백

- 배포 전 release와 Web image를 식별해 보존한다.
- 문제가 생기면 이전 image와 release symlink로 Web만 복원한다.
