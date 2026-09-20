# TIDAL Device Stream 전체 재생 설계

## 목적

`music-pie`의 TIDAL 검색·트랙 목록·큐·셔플 UI는 유지하면서, 공개 Web SDK 대신 사용자 TIDAL 계정으로 승인한 Device Code 토큰과 TIDAL v1 `playbackinfo` 응답을 이용해 전체 트랙을 인앱 재생한다.

이 설계는 사용자의 이전 프로젝트 `my-forever-music`에서 구현한 TIDAL 전용 재생 경로를 현재 Next.js 구조에 맞춰 이식한다. YouTube, 외부 TIDAL 앱·웹, 로컬 음원, 다운로드 기능은 사용하지 않는다.

## 성공 조건

- 로그인 사용자가 TIDAL Device Code 연결을 완료할 수 있다.
- 서버가 `r_stream`을 포함한 실제 발급 scope와 TIDAL 사용자 ID를 암호화된 기존 연결 저장소에 보관한다.
- 트랙 재생 시 서버가 `assetpresentation=FULL`로 `playbackinfo`를 요청한다.
- 응답이 `FULL`이고 재생 가능한 direct 또는 HLS URL일 때 기존 플레이어 UI에서 곡 전체를 재생한다.
- `PREVIEW`, DRM, 비어 있는 manifest, 지원하지 않는 DASH는 전체 재생 성공으로 처리하지 않는다.
- 큐, 셔플, 이전·다음, 일시 정지, seek, 볼륨, 종료 후 다음 곡 동작을 유지한다.
- 브라우저에 access token, refresh token, client secret을 노출하지 않는다.

## 전제와 한계

- 사용자는 해당 곡을 재생할 수 있는 TIDAL 계정과 구독 권한을 가진다.
- TIDAL Device Code endpoint가 현재 client ID를 허용하고, 발급 토큰에 `r_stream` 또는 동등한 streaming scope를 포함해야 한다.
- v1 `playbackinfo`는 공개 Web SDK 계약이 아닌 legacy 경로다. TIDAL 변경으로 중단될 수 있다.
- 암호화된 manifest 또는 DRM 라이선스 우회는 구현하지 않는다. `encryptionType`이 암호화를 나타내면 재생을 거부한다.
- 재생 URL은 저장하거나 다운로드하지 않고 현재 재생 세션에서만 사용한다.

## 구조

### 1. Device Code 인증

Next.js Route Handler 두 개를 추가한다.

- `POST /api/tidal/device-authorization/start`
  - Auth0 사용자를 확인한다.
  - TIDAL device authorization endpoint에 `client_id`와 요청 scope를 전송한다.
  - `deviceCode`, `userCode`, `verificationUri`, 만료 시각, polling 간격을 반환한다.
- `POST /api/tidal/device-authorization/poll`
  - Auth0 사용자를 확인한다.
  - 브라우저가 전달한 `deviceCode`를 token endpoint에서 polling한다.
  - `authorization_pending`과 `slow_down`은 안정된 상태 코드로 반환한다.
  - 성공하면 access/refresh token, 만료 시각, 실제 scope, TIDAL 사용자 ID를 기존 `tidal_connections`에 암호화해 저장한다.

현재 Authorization Code 연결은 플레이리스트·검색용으로 유지한다. Device Code 성공 시 같은 사용자 연결의 토큰을 streaming 가능 토큰으로 갱신한다. 별도 평문 토큰 저장소는 만들지 않는다.

### 2. 서버 재생 경계

`GET /api/tidal/tracks/{trackId}/stream?quality=LOSSLESS`를 추가한다.

처리 순서:

1. Auth0 사용자와 저장된 TIDAL 토큰을 확인하고 필요하면 refresh한다.
2. 토큰 scope에서 streaming 권한을 확인한다.
3. 토큰의 country claim 또는 `TIDAL_COUNTRY_CODE`를 사용한다.
4. TIDAL v1 `/tracks/{id}/playbackinfo`에 `playbackmode=STREAM`, `assetpresentation=FULL`, 요청 quality를 전송한다.
5. Base64 JSON manifest 또는 direct URL을 해석한다.
6. `assetPresentation === FULL`, URL 존재, 비암호화 조건을 검증한다.
7. 브라우저에 재생에 필요한 최소 필드만 반환한다.

응답에는 `streamUrl`, `manifestMimeType`, `durationSeconds`, codec·quality 진단값을 포함한다. 토큰과 원본 provider 응답은 반환하지 않는다. `cache-control: no-store`를 적용한다.

## 클라이언트 재생 엔진

기존 `PlaybackEngine` 인터페이스는 유지하고 구현만 direct stream 기반 엔진으로 교체한다.

- direct audio는 단일 `HTMLAudioElement`에서 재생한다.
- HLS는 브라우저 native HLS를 우선 사용하고, 필요할 때만 `hls.js`를 사용한다.
- DASH는 이번 범위에서 명시적으로 실패한다.
- 현재 트랙을 바꿀 때 이전 HLS 인스턴스와 media source를 정리한다.
- `timeupdate`, `durationchange`, `waiting`, `playing`, `pause`, `ended`, `error`를 기존 `PlaybackEvent`로 변환한다.
- `setNext`는 서버 URL을 미리 발급하지 않는다. 기존 queue controller가 종료 이벤트 후 다음 트랙을 로드한다.

## UI

- 현재 플레이어, 트랙 호버 재생, 큐, 셔플 UI를 유지한다.
- 잘못된 `TIDAL 전체 재생` Embed 버튼과 dialog를 제거한다.
- streaming scope가 없으면 플레이어 영역에 `TIDAL 재생 연결 필요` 상태와 Device Code 연결 동작을 표시한다.
- provider가 `FULL`을 반환하지 않으면 제한 재생으로 전환하지 않고 명확한 재연결/권한 오류를 표시한다.
- 외부 앱·웹 재생 버튼과 YouTube fallback은 추가하지 않는다.

## 보안과 데이터 처리

- token endpoint 호출과 `playbackinfo` 호출은 서버에서만 수행한다.
- 기존 `TOKEN_ENCRYPTION_KEY`와 `tidal_connections` 암호화 저장을 재사용한다.
- 로그에 access token, refresh token, full stream URL, manifest 원문을 기록하지 않는다.
- API 입력의 track ID와 quality를 allowlist로 검증한다.
- stream 응답과 인증 응답은 캐시하지 않는다.

## 오류 계약

- `401 unauthorized`: Auth0 로그인 없음
- `409 tidal_device_authorization_required`: Device Code 연결 없음
- `409 tidal_stream_scope_required`: streaming scope 없음
- `409 tidal_full_playback_unavailable`: provider가 `FULL`을 반환하지 않음
- `415 tidal_stream_format_unsupported`: DRM 또는 지원하지 않는 manifest
- `502 tidal_playback_upstream_failed`: TIDAL 요청/응답 오류

클라이언트는 오류 코드를 사용자 메시지로 매핑하고 큐 상태를 멈춘다. 자동으로 다른 제공자나 제한 재생으로 전환하지 않는다.

## 테스트와 검증

- Device Code start/poll parsing, pending, slow-down, 성공 저장, 오류 테스트
- scope 검사, 토큰 refresh, country·quality 구성 테스트
- `playbackinfo` URL·헤더, manifest decode, FULL/PREVIEW, DRM, HLS/direct/DASH 테스트
- direct/HLS 엔진의 상태·seek·volume·ended·reset 테스트
- 플레이어 queue·shuffle 회귀 테스트
- Embed 제거와 Device Code 연결 UI 테스트
- 전체 Vitest, ESLint, production build, `git diff --check`
- 실제 계정으로 Device Code 승인 후 한 곡의 표시 duration 이상 재생, seek, 다음 곡 전환을 브라우저에서 확인

## 중단 조건

Device Code endpoint가 현재 client ID를 거부하거나 발급 토큰에 streaming scope가 없으면 구현으로 해결하지 않는다. provider가 암호화된 manifest만 반환하면 DRM 우회를 추가하지 않는다. 두 경우 모두 진단 결과를 기록하고 작업을 권한/호환성 차단 상태로 종료한다.
