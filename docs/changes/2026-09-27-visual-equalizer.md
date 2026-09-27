# 실제 재생 신호 기반 비주얼 이퀄라이저

## 변경 이유

전역 플레이어는 재생 제어와 전체 플레이어를 제공하지만 현재 재생 신호를 시각적으로 확인하는 화면은 없었다. 사용자가 소유한 `imorangepie20/my-forever-music` 프로젝트의 Visual EQ 구현을 자유롭게 사용할 수 있다고 확인해, 해당 프로젝트의 HLS segment capture·PCM ring buffer·DFT 구조를 Music Pie의 Next.js 재생 엔진에 맞게 이식했다.

## 변경 내용

- `/visualizer`에 실제 PCM frequency bin을 그리는 막대형·방사형 canvas를 추가했다.
- 막대형은 FFT bin을 로그 주파수 밴드로 묶고 고역 gain을 보정해 저역 막대가 좌측에만 몰리지 않게 했으며, 전체 막대 묶음을 canvas 중앙 기준으로 배치한다.
- 운영 화면 피드백을 반영해 막대 묶음을 canvas 너비의 2.5%만큼 오른쪽으로 미세 조정하고 최대 높이를 stage의 54%에서 46%로 낮춘다.
- 실제 청취보다 시각 반응이 약 2초 늦다는 운영 피드백에 따라 PCM 읽기 시각을 `audio.currentTime`보다 1.8초 앞당겨 표시한다.
- 현재 트랙 artwork, 재생 위치, 이전·재생/일시정지·다음, 대기열 전환과 표시 방식 segmented control을 desktop·mobile 공통으로 제공한다.
- 전역 플레이어에서 TIDAL ID가 있는 현재 트랙에만 `EQ` 진입 링크를 표시하고 Next client navigation으로 재생 세션을 보존한다. 현재 TIDAL 트랙 없이 직접 접근하면 Home으로 복귀한다.
- HLS.js의 `BUFFER_CODECS`·`BUFFER_APPENDING`에서 init/media fMP4를 캡처하고, `AudioContext.decodeAudioData`로 mono PCM을 만든다.
- PCM은 브라우저 메모리의 12초 ring buffer에만 두고 현재 `audio.currentTime`에 맞춰 256 sample Hann-window DFT를 128개 bin으로 계산한다.
- direct stream은 브라우저 CORS fetch를 먼저 사용하고 실패할 때만 인증된 same-origin 분석 API로 재조회한다.
- 분석 API는 signed URL을 입력받거나 응답에 노출하지 않고 `private, no-store`, 48MiB hard cap을 적용한다.
- 실제 분석 신호를 얻지 못하면 가짜 애니메이션을 만들지 않고 대기·지원 불가·오류 상태를 표시한다.
- 비회원 재생 오류는 이퀄라이저 안에서 로그인 필요 상태와 복귀 경로를 직접 제공한다.

## 보안·데이터 경계

- 토큰, 쿠키, Device Code, signed stream URL, raw upstream 응답을 저장하거나 로그에 남기지 않는다.
- 분석 API는 인증된 사용자의 기존 TIDAL 연결과 숫자형 track ID만 사용한다.
- DB migration, 사용자 데이터, EMS catalog, embedding과 상시 worker에는 변경이 없다.

## 검증 결과

- focused Vitest: 7개 파일, 27개 테스트 통과.
- 막대 분포 보완 focused Vitest: 2개 파일, 5개 테스트 통과. 로그 밴드의 저역·고역 분포와 canvas 중앙 정렬을 고정했다.
- 위치·높이·재생 동기화 focused Vitest: 4개 파일, 10개 테스트 통과. 오른쪽 2.5% 오프셋, 높이 상한과 1.8초 timing advance를 고정했다.
- layout·player·visualizer·analysis route 재검증: 5개 파일, 24개 테스트 통과.
- 전체 Vitest: 98개 파일 중 95개, 385개 중 381개 통과. 이번 diff 밖에서 이미 문서화된 Home 기대값 1건과 likes·recommendations API의 HTTP 503 기대 불일치 3건만 실패했다.
- `npm run lint`: 오류 0개, 기존 경고 5개.
- `npm run build`: TypeScript와 Next.js production build 통과. 로컬 build의 Auth0 환경 경고는 유지된다.
- `git diff --check`: 통과.

## 운영 배포와 브라우저 QA

- 기능 커밋 `58ba65e`를 release `/home/approid/apps/music-pie/releases/58ba65e`와 Web image `music-pie-web:58ba65e`로 배포했다.
- 막대 분포 보완 커밋 `2226ca9`를 release `/home/approid/apps/music-pie/releases/2226ca9`와 Web image `music-pie-web:2226ca9`로 Web에 추가 배포했다.
- Web container는 `healthy`이고 local/public readiness, Home, EMS, `/visualizer`가 HTTP 200이다. 비인증 analysis API는 401이다.
- 공개 desktop 브라우저에서 EMS 트랙 선택 뒤 Next client navigation이 현재 트랙과 12곡 대기열을 보존하는 것을 확인했다.
- `/visualizer`에서 현재 artwork·제목·아티스트, 이전/재생/다음, 재생 위치, 대기열 전환, 막대/방사형 키보드 전환이 동작했다.
- 비회원 오류는 `로그인 후 실시간 이퀄라이저를 사용할 수 있습니다.`와 `returnTo=/visualizer` 로그인 링크로 표시되고 브라우저 warning/error는 0건이었다.
- EMS pipeline과 source-routines의 container ID·image·시작 시각은 배포 전후 동일하다. DB migration과 worker restart는 없었다.
- 막대 분포 보완 배포 뒤 app browser 연결이 `User unavailable`이라 로그인 live PCM 화면 재확인은 수행하지 못했다. 로그 밴드 분포와 canvas 중앙 정렬은 focused test로 검증했다.

## 미검증 항목

- browser viewport override가 실제 390x844로 적용되지 않아 mobile은 responsive CSS와 component test까지만 검증했다.
- 로그인된 실제 TIDAL direct MP4·HLS 재생의 PCM 반응, canvas pixel과 브라우저별 codec 지원 범위는 남았다.

## 롤백

- 기능 전체 롤백 기준은 이전 release `/home/approid/apps/music-pie/releases/c76197b`와 image `music-pie-web:pre-visualizer-ca0ce76`이다.
- 막대 분포 보완만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/91b409e`와 image `music-pie-web:pre-visualizer-bars-2226ca9`를 사용한다.
- 오류 상태 보완까지 되돌릴 때는 release `/home/approid/apps/music-pie/releases/f6392b0`와 image `music-pie-web:pre-visualizer-errors-58ba65e`를 사용한다.
- 롤백 시 Web만 재생성하고 EMS·PostgreSQL·embedding·상시 worker는 재시작하지 않는다.
