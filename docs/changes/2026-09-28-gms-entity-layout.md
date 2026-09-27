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
- 기능 커밋과 release `be3c8e5`, Web image `sha256:acf13db2b4e5d1ec103d5664119b06e20d5abb2bd7720cfbb955d2d09e088b88`를 배포했고 Web container `healthy`를 확인했다.
- 로그인된 public GMS에서 추천 12곡이 목록 12행으로 표시되고 기존 `gateway-card`와 gateway rail이 각각 0개임을 확인했다.
- desktop에서 곡·아티스트·앨범·결정 열을, `390x844`에서 곡명 아래 메타데이터와 다음 줄 액션 배치를 확인했다. mobile body 가로 overflow와 잘린 action group은 각각 0건이었다.
- browser warning/error는 0건이고 public health, Home, GMS, MMS와 EMS는 모두 HTTP 200이었다.

## 운영 경계

- DB schema와 data write는 없다.
- 추천 계산·결정 API, 사용자 데이터와 active EMS catalog를 변경하지 않는다.
- 비밀값, token, cookie, signed URL과 raw query를 출력하거나 기록하지 않는다.

## 롤백

- 변경 전 release `/home/approid/apps/music-pie/releases/3884c52`와 Web image `sha256:aad7862ec5cbedf50b5bf9c3ab3879b8c1ddfc2ac4fd0c7e5b99eb324aababfc`를 `music-pie-web:pre-gms-list-be3c8e5`로 보존했다.
- 문제가 생기면 이 image를 `current`로 복원하고 release symlink를 `3884c52`로 되돌린 뒤 Web만 재생성한다.
- EMS pipeline과 source-routines의 container ID, image와 시작 시각은 배포 전후 동일하다.
