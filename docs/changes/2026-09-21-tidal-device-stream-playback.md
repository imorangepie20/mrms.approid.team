# TIDAL Device Stream 전체 재생 구현

## 변경 이유

검색 결과와 플레이어가 제한 재생 URL에 의존하지 않고, 사용자 TIDAL 권한으로 받은 `FULL` playback manifest를 인앱에서 재생하도록 전용 경로가 필요했다.

## 변경 내용

- Device Code 시작·poll API와 암호화 토큰 저장을 추가했다.
- 카탈로그 OAuth client와 Limited Input Device client를 분리할 수 있도록 `TIDAL_DEVICE_CLIENT_ID`, `TIDAL_DEVICE_CLIENT_SECRET`, `TIDAL_DEVICE_SCOPES` 설정을 추가했다.
- `r_stream` 토큰 refresh는 발급에 사용한 device client 설정을 사용한다.
- TIDAL v1 `playbackinfo`에서 `assetpresentation=FULL`을 요청하고 direct/HLS manifest만 반환하는 서버 API를 추가했다.
- 브라우저 재생 엔진을 `HTMLAudioElement`와 `hls.js` 기반으로 교체하면서 queue, shuffle, seek, volume, 반복, 다음 곡 동작을 유지했다.
- 기존 Embed 전체 재생 UI를 제거하고 Device Code 연결 UI를 추가했다.
- provider가 현재 client를 Limited Input Device client로 인정하지 않을 때 `tidal_device_client_unsupported`를 반환하고 설정 필요 상태를 표시한다.
- 사용자 제공 Android APK의 동작을 정적 분석한 결과, 실제 성공 앱은 `r_stream` 없이 `r_usr w_usr w_sub`로 Device Code 인증 후 `FULL + STREAM` playbackinfo를 호출한다. Music Pie의 `r_stream` 단독 선검사를 이 호환 scope 조합도 허용하도록 수정했다.
- Device token 교환 요청에도 승인 시작 요청과 동일한 scope를 전달한다. TIDAL이 token 응답의 scope 필드를 생략하면 요청한 Device scope를 저장한다.
- 하단 플레이어의 `backdrop-filter`가 내부 `position: fixed` 인증 모달의 기준 영역을 플레이어 높이로 제한하던 문제를 수정했다. 인증 모달을 `document.body` 포털로 렌더링해 전체 화면에서 코드와 인증 버튼을 볼 수 있게 했다.
- Device Code poll이 `connected`를 반환하면 polling 핸들을 정리하고 인증 모달을 자동으로 닫는다.
- stream API에서 `quality`를 생략했을 때 `HI_RES_LOSSLESS`를 요청하도록 기본 음질을 변경했다. 실제 반환 음질은 TIDAL이 계정·트랙·국가 조건에 따라 결정한다.

## 실제 외부 검증 결과

- 현재 `TIDAL_CLIENT_ID`로 Device Code 시작 요청: HTTP `400`, provider sub-status `1002`.
- provider 판정: 현재 client는 Limited Input Device client가 아니다.
- 기존 Authorization Code 요청에 신형 카탈로그 scope와 legacy streaming scope를 혼합한 실험: TIDAL 로그인 화면에서 오류 `1002`.
- 따라서 현재 client ID만으로 실제 `FULL` manifest 발급과 장시간 재생은 검증하지 못했다.
- 별도 Limited Input Device client를 `TIDAL_DEVICE_CLIENT_ID`에 설정하면 구현된 Device Code 경로가 그 client를 사용한다. 기존 카탈로그 client 설정은 유지된다.
- 사용자 제공 APK SHA-256: `BA63087F6F53A06D8C47B5237D8E44C7EB6B3C87FD6C2C474E2406E0799D76AB`.
- APK 확인값: Device scope `r_usr w_usr w_sub`, `/device_authorization`, `/token`, `/playbackinfo`, `playbackmode=STREAM`, `assetpresentation=FULL`. APK 내부 client 자격증명은 문서나 로그에 기록하지 않았다.
- 사용자 승인 후 APK의 Device client 설정을 로컬 `.env.local`에만 적용했다. TIDAL Device Code 시작은 HTTP `200`, 동일 client 인증을 사용한 즉시 token poll은 `authorization_pending`을 반환해 client ID/secret 쌍이 유효함을 확인했다.
- token 교환 요청에서 scope 누락을 수정한 뒤 다시 승인했다. 발급 토큰과 JWT claim 모두 실제 scope `w_usr w_sub r_usr`를 포함했다.
- 트랙 `5761228`의 TIDAL `playbackinfo` 요청은 HTTP `200`, `assetPresentation=FULL`, `audioQuality=HIGH`, manifest 포함 응답을 반환했다.
- `https://mrms.approid.team/search`에서 `One More Time`을 재생해 플레이어가 `0:01 / 5:20`과 `일시 정지` 상태로 전환되는 것을 확인했다.
- 인증 성공 후 모달만 닫히고 기존 `playbackError`가 남아 `TIDAL 재생 연결` 버튼이 계속 표시되던 문제를 수정했다. 성공 콜백에서 현재 큐 항목을 다시 로드해 오류 상태를 해제하고 재생을 자동 재시도한다.
- 재발 조사에서 DB 연결은 `connected`, access/refresh token은 존재하며 만료 전이었고, 동일 저장 토큰으로 문제 트랙 `290639630`의 playback API가 HTTP 200을 반환했다. 따라서 원인은 토큰 유실이 아니라 클라이언트 오류 상태 미해제였다.

## 검증

- 관련 Vitest: 통과
- 인증 성공 자동 재시도 회귀를 포함한 전체 Vitest 51개 파일·182개 테스트, ESLint, production build 통과
- 새 production build로 44119 서버를 교체한 뒤 로컬·공개 `/mms`가 모두 HTTP 200을 반환했다.
- ESLint: 통과
- production build: 통과
- 실제 검색 결과, 플레이어 연결 오류 매핑, 별도 client 설정 경계: 확인
- 실제 Device Code 승인, `FULL` manifest 발급, 브라우저 재생 시작: 확인
- 인증 모달 포털 회귀 테스트와 전체 Vitest 50개 파일·169개 테스트: 통과
- 실제 재승인 후 DB에 Device scope `w_usr w_sub r_usr`가 저장되는 것을 확인했다.
- 새 production 빌드 적용 후 사용자가 인증 모달 자동 닫힘과 트랙 전체 재생 성공을 확인했다.
- 사용자가 실제 재생 중 seek와 queue 다음 곡 전환도 정상 동작한다고 확인했다.

## 미검증 항목

- 실제 모바일 기기의 오디오 출력과 백그라운드 재생

## 다음 작업

1. 실제 모바일 기기에서 오디오 출력과 백그라운드 재생을 검증한다.

## 상세 구현 문서

- `docs/deployment/tidal-full-playback-implementation.md`
