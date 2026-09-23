# TIDAL 재생 품질 폴백 계획

## 범위

- 최고 음질을 먼저 요청하되 현재 브라우저 재생 엔진이 지원하지 않는 DASH/DRM 응답이면 다음 품질로 자동 전환한다.
- 기본 품질을 낮은 값으로 고정하지 않는다.
- 스트림 파서와 회귀 테스트로 502 반복을 재현·차단한다.

## 완료 기준

- 기본 요청 순서는 `HI_RES_LOSSLESS → HI_RES → LOSSLESS → HIGH → LOW`다.
- 직접 재생 가능한 무암호화 URL을 받으면 즉시 해당 품질을 반환한다.
- 명시적 `quality` 요청은 fallback하지 않는다.
- 전체 테스트·lint·build와 운영 stream smoke가 통과한다.
