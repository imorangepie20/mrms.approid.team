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

## 실제 외부 검증 결과

- 현재 `TIDAL_CLIENT_ID`로 Device Code 시작 요청: HTTP `400`, provider sub-status `1002`.
- provider 판정: 현재 client는 Limited Input Device client가 아니다.
- 기존 Authorization Code 요청에 신형 카탈로그 scope와 legacy streaming scope를 혼합한 실험: TIDAL 로그인 화면에서 오류 `1002`.
- 따라서 현재 client ID만으로 실제 `FULL` manifest 발급과 장시간 재생은 검증하지 못했다.
- 별도 Limited Input Device client를 `TIDAL_DEVICE_CLIENT_ID`에 설정하면 구현된 Device Code 경로가 그 client를 사용한다. 기존 카탈로그 client 설정은 유지된다.
- 사용자 제공 APK SHA-256: `BA63087F6F53A06D8C47B5237D8E44C7EB6B3C87FD6C2C474E2406E0799D76AB`.
- APK 확인값: Device scope `r_usr w_usr w_sub`, `/device_authorization`, `/token`, `/playbackinfo`, `playbackmode=STREAM`, `assetpresentation=FULL`. APK 내부 client 자격증명은 문서나 로그에 기록하지 않았다.

## 검증

- 관련 Vitest: 통과
- ESLint: 통과
- production build: 통과
- 실제 검색 결과, 플레이어 연결 오류 매핑, 별도 client 설정 경계: 확인

## 미검증 항목

- Limited Input Device 권한이 있는 실제 client로 Device Code 승인 완료
- 발급 토큰의 `r_stream` 확인
- 실제 `FULL` direct/HLS 재생, seek, 다음 곡 전환

## 다음 작업

1. TIDAL에서 Limited Input Device가 허용된 client ID를 발급 또는 현재 앱에 해당 기능을 활성화한다.
2. `apps/web/.env.local`에 `TIDAL_DEVICE_CLIENT_ID`와 필요 시 `TIDAL_DEVICE_CLIENT_SECRET`을 설정한다.
3. `https://mrms.approid.team/search`에서 `TIDAL 재생 연결`을 승인한다.
4. 한 곡의 전체 duration, seek, queue 다음 곡 전환을 실제 계정으로 검증한다.
