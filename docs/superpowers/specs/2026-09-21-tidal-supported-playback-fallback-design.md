# TIDAL 지원 재생 폴백 설계

## 목적

Music Pie의 검색·MMS·EMS 트랙에서 공식 TIDAL 재생 경로를 최대한 활용한다. 페이지 이동 후에도 현재 선택과 앱 큐는 유지한다. TIDAL이 허용하지 않는 스트림 추출, URL 재사용, DRM·CORS 우회는 하지 않는다.

## 제약

- 현재 `@tidal-music/player` 경로는 TIDAL 서버가 발급한 재생 자산만 사용할 수 있다.
- 전체 길이 재생은 TIDAL Embed와 TIDAL 구독 상태에 의해 결정된다.
- TIDAL Embed는 부모 앱에서 큐, 셔플, 이전·다음, 위치를 제어하는 공식 API를 제공하지 않는다.
- 브라우저 자동 재생 정책 때문에 Embed 재생 시작은 사용자 동작이 필요하다.

## 선택한 구조

기존 전역 플레이어를 제거하지 않고 공식 재생 경로를 병렬 제공한다.

1. 트랙을 선택하면 기존 앱 큐와 현재 트랙 상태를 갱신한다.
2. 전역 플레이어에 `TIDAL에서 전체 재생` 동작을 추가한다.
3. 이 동작은 현재 트랙의 `https://embed.tidal.com/tracks/{id}`를 전역 다이얼로그에 표시한다.
4. 앨범·플레이리스트 상세에서는 컬렉션 ID가 있을 때 각각 `albums/{id}`, `playlists/{id}` Embed를 열 수 있다. 컬렉션 내부 연속 재생은 Embed가 담당한다.
5. Embed가 로드되지 않거나 사용자가 외부 앱을 선호하면 `https://tidal.com/browse/track/{id}`를 새 탭으로 연다.
6. 기존 SDK 플레이어와 앱 큐·셔플·반복 기능은 유지한다. Embed와 동시에 소리가 나지 않도록 Embed를 열기 전에 SDK 재생을 일시 정지한다.

## UI

- 전역 플레이어의 현재 트랙 영역에 TIDAL 전체 재생 버튼을 둔다.
- 버튼을 누르면 현재 화면 위에 반응형 다이얼로그가 열린다.
- 다이얼로그는 TIDAL 출처, 닫기, 외부 TIDAL 열기를 제공한다.
- iframe 제목과 다이얼로그 레이블을 제공하고 `allow="encrypted-media"`를 사용한다.
- 모바일에서는 화면 폭을 사용하고 데스크톱에서는 읽기 쉬운 최대 폭을 둔다.

## 오류 처리

- TIDAL ID가 없는 fixture 트랙에는 전체 재생 버튼을 표시하지 않는다.
- iframe 로드 실패를 완전히 판별할 수 없으므로 외부 TIDAL 링크를 항상 제공한다.
- Embed를 닫아도 앱 큐와 현재 트랙은 유지한다.
- Embed가 열려 있는 동안 SDK 재생을 자동 재개하지 않는다.

## 변경 범위

- `apps/web/src/components/player/`: Embed 다이얼로그와 전역 플레이어 진입점
- `apps/web/src/components/search/tidal-search.tsx`: 앨범·플레이리스트 Embed 진입점
- 필요한 경우 작은 URL 생성 유틸리티
- 관련 컴포넌트 테스트와 변경 기록

## 완료 조건

- TIDAL 트랙에서 공식 Embed를 열고 닫을 수 있다.
- 외부 TIDAL 링크가 올바른 트랙 ID를 사용한다.
- Embed를 열 때 기존 SDK 재생이 일시 정지된다.
- TIDAL ID가 없는 트랙의 기존 동작은 변하지 않는다.
- 검색 상세에서 앨범·플레이리스트 Embed를 열 수 있다.
- 관련 테스트, ESLint, production build, `git diff --check`가 통과한다.

## 제외

- 스트림 manifest 또는 segment URL을 앱으로 추출하거나 저장하는 기능
- 비공식 API, 요청 변조, DRM·CORS 우회
- TIDAL 플레이리스트 쓰기 권한 추가
- 네이티브 Android·iOS 플레이어
