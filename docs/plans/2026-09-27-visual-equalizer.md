# 실제 재생 신호 기반 비주얼 이퀄라이저

## 이유와 완료 기준

- 사용자가 소유한 `imorangepie20/my-forever-music`의 Visual EQ 구현을 현재 Music Pie 재생 구조에 맞게 이식한다.
- TIDAL 재생 중인 트랙에 한해서 `/visualizer`에서 실제 PCM 주파수 데이터에 반응하는 막대형·방사형 시각화를 제공한다.
- 전역 플레이어에서 이퀄라이저로 진입하고, 화면 안에서 재생·탐색·대기열 전환·모드 변경·닫기를 키보드와 390x844 모바일에서도 사용할 수 있게 한다.
- 가짜 난수 신호는 사용하지 않는다. 분석이 불가능하면 움직이는 척하지 않고 지원 불가 상태를 명확히 표시한다.

## 변경 범위와 순서

1. HLS.js의 audio/audiovideo init·media segment를 구독하는 캡처 경로와 direct MP4 분석 경로를 추가한다.
2. 캡처된 fMP4 또는 완전한 direct audio를 `AudioContext.decodeAudioData`로 mono PCM으로 변환하고 12초 ring buffer에 보관한다.
3. 재생 시각에 맞춘 256 sample Hann-window DFT를 128개 frequency bin으로 노출한다.
4. `/visualizer` 화면, 막대형·방사형 canvas, 재생 컨트롤, 대기열과 전역 플레이어 진입 버튼을 추가한다.
5. 단위·컴포넌트·API 회귀 테스트, 전체 Web 테스트·lint·build, desktop·390x844 browser QA를 수행한다.
6. 검증 결과를 변경 기록과 current context에 반영한 뒤 커밋·push하고 Web만 배포한다.

## 외부 요청·보안 경계

- direct stream은 브라우저 CORS fetch를 먼저 시도한다. 실패한 경우에만 인증된 same-origin 분석 API가 트랙 ID로 스트림을 다시 조회한다.
- 분석 API는 signed stream URL을 입력으로 받지 않고, 인증된 사용자의 기존 TIDAL 연결만 사용한다.
- 분석 응답은 `no-store`이며 최대 48MiB로 제한한다. 초과·지원 불가·upstream 실패는 내부 URL이나 토큰 없이 오류 코드만 반환한다.
- 토큰, 쿠키, Device Code, signed stream URL, raw upstream 응답은 코드·문서·테스트·로그에 기록하지 않는다.
- 분석은 사용자가 `/visualizer`를 열어 둔 동안에만 수행하고 PCM은 브라우저 메모리에만 존재한다.

## 배포·롤백

- DB migration과 EMS 카탈로그·사용자 데이터 변경은 없다.
- 기존 active EMS, PostgreSQL, embedding, 상시 worker를 재시작하지 않고 Web image와 release symlink만 전환한다.
- 배포 전 현재 Web image와 release symlink를 롤백 식별자로 기록한다.
- 오류 시 이전 Web image와 release symlink로 복원하고 Web만 재생성한다.

## 검증 기준

- PCM ring buffer, DFT, HLS capture, direct source 통지, 분석 API 상한과 인증 경계 테스트가 통과한다.
- 현재 트랙이 있을 때만 진입할 수 있고, 트랙이 없는 직접 접근은 Home으로 복귀한다.
- desktop과 390x844에서 canvas가 비어 있지 않고 UI 중첩이 없으며, 키보드 focus·재생·seek·대기열·모드 전환이 동작한다.
- 운영 smoke에서 readiness, Home, EMS, `/visualizer`가 성공하고 기존 서비스가 유지된다.

## 미검증 가능 범위

- 브라우저·OS별 `decodeAudioData` codec 지원 범위와 Bluetooth 출력 지연은 전체 조합을 검증하지 않는다.
- 로그인된 운영 계정으로 실제 TIDAL 재생을 수행할 수 없는 경우, live PCM 반응은 로컬 합성 fixture 검증과 운영 API·UI smoke를 분리해 기록한다.
