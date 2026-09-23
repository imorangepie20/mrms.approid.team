# TIDAL 재생 품질 자동 폴백

## 원인

운영 TIDAL `playbackinfo` 응답에서 `HI_RES_LOSSLESS`와 `HI_RES`는 `application/dash+xml` DASH manifest를 반환했다. 현재 웹 플레이어는 direct stream과 HLS만 처리하므로 manifest 파싱이 실패해 `/api/tidal/tracks/:id/stream`이 502를 반환했다. `LOSSLESS` 이하 요청은 무암호화 MP4 URL을 반환한다.

## 변경

- 기본은 최고 품질 `HI_RES_LOSSLESS`부터 요청한다.
- DASH/DRM/잘못된 manifest 또는 upstream 실패 시 `HI_RES`, `LOSSLESS`, `HIGH`, `LOW` 순서로 재시도한다.
- 브라우저가 재생 가능한 첫 무암호화 direct URL을 반환한다.
- 호출자가 `quality`를 지정한 경우 요청 품질만 시도해 명시적 선택을 보존한다.
- XML manifest를 unsupported format으로 분류해 502 대신 품질 fallback 경로로 보낸다.

## 검증

- 운영 TIDAL 계정으로 품질별 응답을 확인: `HI_RES_LOSSLESS`/`HI_RES`는 DASH, `LOSSLESS`는 `application/vnd.tidal.bts`와 MP4 URL.
- `apps/web`: `npm run test -- --run` — 84개 파일, 346개 테스트 통과.
- `apps/web`: `npm run lint` — 오류 0개, 기존 경고 3개.
- `apps/web`: `npm run build` — TypeScript·production build 통과.
