# 온보딩 취향 분석 진행률 표시

## 변경 이유

회원가입과 TIDAL 연결 뒤 `MMS 만들기`를 실행하면 플레이리스트 저장·MusicBrainz 처리·취향 벡터 분석이 순서대로 진행되지만, 기존 화면은 완료 수와 남은 수를 텍스트로만 표시했다. 사용자가 현재 단계와 실제 처리량을 더 빠르게 이해할 수 있도록 진행률 표시가 필요했다.

## 변경 내용

- 플레이리스트 저장 단계는 서버가 전체 작업량을 아직 제공하지 않으므로 값을 조작하지 않는 무한 진행 바를 표시한다.
- MusicBrainz 단계는 import 완료 시점의 pending 수와 이후 `remaining`으로 실제 처리 수를 표시한다. terminal failure도 remaining 감소에 포함될 수 있어 성공을 뜻하는 `보강 완료`가 아니라 중립적인 `처리` 문구를 사용한다.
- 취향 벡터 단계는 서버가 반환한 `embeddedTrackCount + remaining + failedTrackCount`를 분모로 하고 성공한 embedding 수를 현재 값으로 표시한다.
- `profileReady`가 참인 완료 화면에서만 100%를 표시한다.
- 실패와 재시도 중 마지막으로 확인한 진행 수치와 분모를 유지하며, 기존 MMS 저장·분석 재시도·수동 `/gms` 이동 흐름은 변경하지 않았다.
- native `progress`, 접근 가능한 이름·`aria-valuetext`, live status를 제공하고 `390px` 레이아웃과 reduced-motion 스타일을 추가했다.
- 추천 자동 생성·자동 이동, DB schema·API 계약, 새로고침 복구는 변경하지 않았다.

## 검증 결과

- TDD RED에서 새 진행률 테스트 5건이 실패하고 기존 14건이 통과하는 것을 확인했다.
- 수정 뒤 온보딩 focused 2개 파일·20개 테스트가 통과했다.
- Web 전체 144개 파일 중 141개 통과·3개 skip, 총 555개 테스트 중 552개 통과·3개 skip이다.
- ESLint 오류 0개이며 기존 경고 6개만 남았다.
- production build와 TypeScript, 52개 route 생성을 통과했다.
- 코드 검토의 MusicBrainz 성공 수치 과장 지적을 반영해 `처리` 문구로 수정했고 focused 테스트와 build를 다시 통과했다.
- `git diff --check`를 통과했다.

## 운영 배포

- 기능 커밋 `1291bf9`를 `origin/main`에만 push했다. 기능 브랜치는 원격으로 push하지 않았다.
- release archive는 6,369,280바이트, SHA-256 `cdf8b7fe0825786808205a414391bdcd402628f57ed6f1d888db6723020387ff`이며 Zorin release는 `/home/approid/apps/music-pie/releases/1291bf9`다.
- Web image는 `sha256:8e1c1be63a646e7ea2b0060df8e6613c0eb46b8a6962b794dcf4c26ba45464d8`, container는 `c941a4d56074`이고 healthy·restart 0이다.
- rollback image `music-pie-web:pre-onboarding-progress-1291bf9`는 `sha256:6bdca7d395ad204bd678c9f4b998e80e272e886c762fcc0f40bb703de1d5be1f`다.
- PostgreSQL `9cc7a8abe9d6`, embedding `ec92b779e416`, audio-analysis `55e9d9e9dc3f`, EMS `70208048b7c2`, source-routines `d5e6f27110e6`, tunnel `7d7bf370d6b7`는 재생성하지 않았고 모두 restart 0이다.
- local/public readiness와 공개 `/onboarding?tidal=connected`는 HTTP 200이며 최근 10분 Web 오류 로그는 0건이다.
- 운영 브라우저에서 로그인된 온보딩과 TIDAL 플레이리스트 목록의 접근성 렌더링을 확인했다. 사용자 데이터를 변경하지 않기 위해 `MMS 만들기`는 실행하지 않았다.
- 배포된 server/static bundle에 `플레이리스트 저장 진행`과 `취향 벡터 분석 진행` 접근성 라벨이 포함된 것을 확인했다.

## 미검증·다음 작업

- 실제 사용자 데이터가 필요한 import·MusicBrainz·embedding 진행 화면은 운영에서 실행하지 않았다.
- 실제 `390×844` viewport의 진행 상태 시각 검증과 새로고침 뒤 자동 복구는 후속 작업으로 남긴다.

