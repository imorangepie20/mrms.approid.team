# TIDAL 검색과 영속 재생

## 변경 이유

저장한 플레이리스트를 분석하는 흐름에 더해 TIDAL 카탈로그를 직접 검색하고, 검색 결과를 앱의 전역 플레이어에서 재생할 수 있어야 했다. route 이동 중에는 현재 queue와 재생 상태를 유지하고, 브라우저에는 재생에 필요한 최소 자격 증명만 전달하도록 경계를 분리했다.

## 변경 내용

- 만료 임박 access token을 서버에서 직렬화해 갱신하고 `playback` scope를 확인하는 playback credentials API를 추가했다.
- `@tidal-music/player`를 브라우저에서만 동적 import하는 singleton adapter를 추가했다.
- `MusicSessionProvider`를 실제 SDK 이벤트 기반 reducer로 바꾸고 loading, playing, paused, stalled, error 상태와 초 단위 position·duration을 관리한다.
- queue 항목별 `referenceId`와 index를 사용해 같은 TIDAL track ID가 중복되어도 previous, next, ended 전환이 정확하게 동작하도록 했다.
- TIDAL `searchResults`와 `searchSuggestions` JSON:API 응답을 track, album, artist 결과로 정규화하는 서버 adapter와 API routes를 추가했다.
- 검색 입력은 200 Unicode code point로 제한하고, suggestions는 두 글자부터 요청하며, TIDAL API와 다른 origin의 cursor를 거부한다.
- `/search`에 250ms debounce, 이전 요청 취소, 최신 응답만 반영하는 결과 탭과 검색 결과 직접 재생을 추가했다.
- 앨범 이미지가 실패하면 기존 gradient placeholder를 표시한다.
- 최상위 음악 session 경계와 전역 플레이어에 회귀 검증용 표식을 추가했다. 내부 앱 경로는 기존 Next.js `Link`를 유지하므로 client navigation에서 provider가 다시 생성되지 않는다.

## 검증 결과

- 관련 재생·검색 테스트: 5개 파일, 17개 테스트 통과.
- 전체 `npm run test`: 40개 파일, 118개 테스트 통과.
- `npm run lint`: 오류 없이 통과.
- `npm run build`: production build 통과. `/api/tidal/playback-credentials`, `/api/tidal/search`, `/api/tidal/search/suggestions`, `/search`가 build 결과에 포함됐다.

## 미검증 항목

- 이 작업 환경에서는 실제 TIDAL 사용자 세션과 재생 가능한 계정이 제공되지 않아 실제 검색 결과·음원 asset을 사용한 브라우저 재생은 확인하지 않았다.
- 실제 계정의 play, pause, seek, previous, next, ended 자동 전환과 `/search`에서 `/mms`로 이동한 뒤 재생 위치 유지는 브라우저 수동 검증이 남아 있다.
- 새로고침 뒤 SDK가 새 브라우저 session에서 다시 초기화되는 동작은 adapter 단위 테스트와 build로만 검증했다.

## 다음 작업

실제 계정 환경에서 검색 결과의 앨범 이미지와 전체 재생 제어를 확인하고, 발견되는 SDK event payload 차이가 있으면 adapter fixture와 회귀 테스트에 먼저 반영한다.
