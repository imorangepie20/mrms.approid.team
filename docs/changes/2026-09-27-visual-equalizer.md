# 실제 재생 신호 기반 비주얼 이퀄라이저

## 변경 이유

전역 플레이어는 재생 제어와 전체 플레이어를 제공하지만 현재 재생 신호를 시각적으로 확인하는 화면은 없었다. 사용자가 소유한 `imorangepie20/my-forever-music` 프로젝트의 Visual EQ 구현을 자유롭게 사용할 수 있다고 확인해, 해당 프로젝트의 HLS segment capture·PCM ring buffer·DFT 구조를 Music Pie의 Next.js 재생 엔진에 맞게 이식했다.

## 변경 내용

- `/visualizer`에 실제 PCM frequency bin을 그리는 막대형·방사형 canvas를 추가했다.
- 현재 트랙 artwork, 재생 위치, 이전·재생/일시정지·다음, 대기열 전환과 표시 방식 segmented control을 desktop·mobile 공통으로 제공한다.
- 전역 플레이어에서 TIDAL ID가 있는 현재 트랙에만 `EQ` 진입 링크를 표시하고 Next client navigation으로 재생 세션을 보존한다. 현재 TIDAL 트랙 없이 직접 접근하면 Home으로 복귀한다.
- HLS.js의 `BUFFER_CODECS`·`BUFFER_APPENDING`에서 init/media fMP4를 캡처하고, `AudioContext.decodeAudioData`로 mono PCM을 만든다.
- PCM은 브라우저 메모리의 12초 ring buffer에만 두고 현재 `audio.currentTime`에 맞춰 256 sample Hann-window DFT를 128개 bin으로 계산한다.
- direct stream은 브라우저 CORS fetch를 먼저 사용하고 실패할 때만 인증된 same-origin 분석 API로 재조회한다.
- 분석 API는 signed URL을 입력받거나 응답에 노출하지 않고 `private, no-store`, 48MiB hard cap을 적용한다.
- 실제 분석 신호를 얻지 못하면 가짜 애니메이션을 만들지 않고 대기·지원 불가·오류 상태를 표시한다.

## 보안·데이터 경계

- 토큰, 쿠키, Device Code, signed stream URL, raw upstream 응답을 저장하거나 로그에 남기지 않는다.
- 분석 API는 인증된 사용자의 기존 TIDAL 연결과 숫자형 track ID만 사용한다.
- DB migration, 사용자 데이터, EMS catalog, embedding과 상시 worker에는 변경이 없다.

## 검증 결과

- focused Vitest: 7개 파일, 27개 테스트 통과.
- layout·player·visualizer·analysis route 재검증: 5개 파일, 24개 테스트 통과.
- 전체 Vitest: 98개 파일 중 95개, 385개 중 381개 통과. 이번 diff 밖에서 이미 문서화된 Home 기대값 1건과 likes·recommendations API의 HTTP 503 기대 불일치 3건만 실패했다.
- `npm run lint`: 오류 0개, 기존 경고 5개.
- `npm run build`: TypeScript와 Next.js production build 통과. 로컬 build의 Auth0 환경 경고는 유지된다.
- `git diff --check`: 통과.

## 배포 전 미검증 항목

- 공개 서버의 desktop·390x844 화면, canvas pixel, 키보드 focus, 대기열·모드 전환은 Web 배포 뒤 확인한다.
- 로그인된 실제 TIDAL direct MP4·HLS 재생의 PCM 반응과 브라우저별 codec 지원 범위는 운영 QA 결과를 별도로 기록한다.

## 롤백

- 배포 전 현재 release symlink와 Web image를 확인해 롤백 식별자로 보존한다.
- 문제 발생 시 이전 Web image와 release symlink로 복원하고 Web만 재생성한다. EMS·PostgreSQL·embedding·상시 worker는 재시작하지 않는다.
