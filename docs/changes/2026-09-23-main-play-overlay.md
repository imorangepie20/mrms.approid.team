# 메인 재생 오버레이 복구

## 변경 이유

Home의 EMS 카드가 `.cover-play-button`의 전역 hover 스타일과 TrackCard 내부의 `opacity-0`·`pointer-events-none` 조건을 동시에 적용하고 있었다. 데스크톱에서 artwork 위로 hover가 정확히 유지되지 않으면 재생 아이콘이 사라지고 버튼을 누를 수 없어 메인 재생이 간헐적으로 동작하는 것처럼 보였다.

## 변경 내용

- TrackCard의 재생 오버레이를 기본 표시 상태로 변경했다.
- 재생 버튼에 전용 `track-card-play-button` 클래스를 부여하고 항상 `pointer-events-auto`로 유지했다.
- 전역 GMS/Gateway hover 규칙과 충돌하지 않도록 TrackCard 전용 CSS override를 추가했다.
- 오버레이 표시·상호작용 클래스 회귀 테스트를 추가했다.

## 확인 결과

- Home API 응답: HTTP 200, `tidalTrackId`·`playbackAvailable: true`·`artworkUrl` 포함 확인.
- `apps/web`: `npm run test -- --run` — 84개 파일, 345개 테스트 통과.
- `apps/web`: `npm run lint` — 오류 0개, 기존 미사용 변수 경고 3개.
- `apps/web`: `npm run build` — TypeScript·production build 통과.
- `git diff --check` — 통과.

## 미확인 항목

- 현재 브라우저 세션의 실제 TIDAL 오디오 재생은 브라우저 자동화 세션 timeout으로 이 변경에서 재확인하지 못했다. 공개 Home API의 재생 식별자와 기존 재생 엔진 테스트는 통과했다.
