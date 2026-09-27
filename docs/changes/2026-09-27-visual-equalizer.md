# 실제 재생 신호 기반 비주얼 이퀄라이저

## 변경 이유

전역 플레이어는 재생 제어와 전체 플레이어를 제공하지만 현재 재생 신호를 시각적으로 확인하는 화면은 없었다. 사용자가 소유한 `imorangepie20/my-forever-music` 프로젝트의 Visual EQ 구현을 자유롭게 사용할 수 있다고 확인해, 해당 프로젝트의 HLS segment capture·PCM ring buffer·DFT 구조를 Music Pie의 Next.js 재생 엔진에 맞게 이식했다.

## 변경 내용

- 독립 `/visualizer` UI와 compact player의 `EQ` 링크를 제거하고, 전체 플레이어 앨범 아트 하단 27% 영역에 실제 PCM frequency bin을 그리는 반투명 막대형 overlay를 배치했다. 기존 `/visualizer` URL은 Home으로 이동한다.
- 막대형은 FFT bin을 로그 주파수 밴드로 묶고 고역 gain을 보정해 저역 막대가 좌측에만 몰리지 않게 했으며, 전체 막대 묶음을 canvas 중앙 기준으로 배치한다.
- 운영 화면 피드백을 반영해 막대 묶음을 canvas 너비의 2.5%만큼 오른쪽으로 미세 조정하고 최대 높이를 stage의 54%에서 46%로 낮춘다.
- `/visualizer` 진입 직후 약 2초 동안 막대가 시작하지 않는다는 운영 피드백에 따라 마지막 HLS media segment를 메모리에 1개만 보존하고 늦게 연결된 analyser에 즉시 재전달한다. 재생 중 동기화를 왜곡하던 timing advance는 제거했다.
- direct `LOSSLESS` 재생에서는 큰 FLAC 전체 다운로드가 첫 EQ 시작을 지연시키므로, 재생 음질은 유지하면서 분석 전용 same-origin 요청만 `LOW` 품질로 고정해 초기 전송·decode 크기를 줄인다.
- 전체 플레이어를 연 뒤에 analyser를 생성하던 구조 때문에 overlay가 늦게 준비되는 결함을 수정했다. analyser는 전역 플레이어와 함께 한 번만 마운트해 재생 시작부터 분석을 준비하고, 전체 플레이어를 열고 닫아도 같은 분석 상태를 유지한다.
- 분석 전용 파일 전체의 다운로드와 `decodeAudioData` 완료를 기다리던 direct stream 경로를 same-origin streaming media와 Web Audio `AnalyserNode` 경로로 교체했다. 무음 gain graph에서 즉시 frequency bin을 읽고 실제 플레이어의 재생·일시정지·현재 시각을 동기화하며, 미지원·실패 브라우저에서는 기존 bounded 전체 디코드로 복귀한다.
- 운영 캡처에서 넓은 주파수 구간이 같은 높이로 포화된 것을 확인해 고역 gain을 2.6에서 0.45로 낮추고 hard clipping을 완만한 곡선으로 교체했다. overlay는 31%에서 27%, 막대 최대 높이는 46%에서 38%로 줄여 앨범 아트 가림을 완화한다.
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
- 위치·높이·시작 지연 focused Vitest: 4개 파일, 12개 테스트 통과. 오른쪽 2.5% 오프셋, 높이 상한과 늦은 HLS 구독자의 최신 media segment 즉시 수신을 고정했다.
- direct 분석 경량화 포함 focused Vitest: 5개 파일, 13개 테스트 통과. 재생 품질과 무관하게 분석 요청이 `quality=LOW`를 사용함을 고정했다.
- 전체 플레이어 overlay 전환 focused Vitest: 4개 파일, 15개 테스트 통과. TIDAL 트랙 overlay, 로컬 트랙 미표시, compact EQ 링크 제거와 `/visualizer` Home 전환을 고정했다.
- analyser 수명 회귀 focused Vitest: 4개 파일, 19개 테스트 통과. 전체 플레이어를 열기 전부터 analyser가 1개만 마운트되고 dialog를 열어도 재마운트되지 않는 조건을 고정했다.
- live streaming analyser focused Vitest: 5개 파일, 21개 테스트 통과. same-origin 분석 URL, 무음 Web Audio graph, frequency bin read, 재생 시각 동기화와 전체 디코드 fallback을 고정했다.
- overlay 전환 focused ESLint는 오류 0개, 기존 전체 플레이어 `aria-description` 경고 1개이며 Next.js production build와 TypeScript가 통과했다.
- layout·player·visualizer·analysis route 재검증: 5개 파일, 24개 테스트 통과.
- 전체 Vitest: 98개 파일 중 95개, 385개 중 381개 통과. 이번 diff 밖에서 이미 문서화된 Home 기대값 1건과 likes·recommendations API의 HTTP 503 기대 불일치 3건만 실패했다.
- `npm run lint`: 오류 0개, 기존 경고 5개.
- `npm run build`: TypeScript와 Next.js production build 통과. 로컬 build의 Auth0 환경 경고는 유지된다.
- `git diff --check`: 통과.

## 운영 배포와 브라우저 QA

- 기능 커밋 `58ba65e`를 release `/home/approid/apps/music-pie/releases/58ba65e`와 Web image `music-pie-web:58ba65e`로 배포했다.
- 막대 분포 보완 커밋 `2226ca9`를 release `/home/approid/apps/music-pie/releases/2226ca9`와 Web image `music-pie-web:2226ca9`로 Web에 추가 배포했다.
- 위치·높이·동기화 보완 커밋 `0e6440c`를 release `/home/approid/apps/music-pie/releases/0e6440c`와 Web image `music-pie-web:0e6440c`로 Web에 추가 배포했다.
- 시작 지연 보완 커밋 `968cff2`를 release `/home/approid/apps/music-pie/releases/968cff2`와 Web image `music-pie-web:968cff2`로 Web에 추가 배포했다. 앞선 timing advance는 이 배포에서 제거했다.
- direct 분석 경량화 커밋 `77e7dda`를 release `/home/approid/apps/music-pie/releases/77e7dda`와 Web image `music-pie-web:77e7dda`로 Web에 추가 배포했다.
- 전체 플레이어 overlay 전환 커밋 `102ffb5`를 release `/home/approid/apps/music-pie/releases/102ffb5`와 Web image `music-pie-web:102ffb5`로 Web에 추가 배포했다. local/public Home·MMS·readiness는 200이고 `/visualizer`는 Home으로 307 전환한다.
- analyser 사전 준비 수정 커밋 `af30576`을 release `/home/approid/apps/music-pie/releases/af30576`과 Web image `music-pie-web:af30576`으로 Web에 추가 배포했다. local/public readiness·Home·MMS·EMS는 200이고 `/visualizer`는 Home으로 307 전환한다.
- live streaming analyser 수정 커밋 `54a5988`을 release `/home/approid/apps/music-pie/releases/54a5988`과 Web image `music-pie-web:54a5988`으로 Web에 추가 배포했다. local readiness·Home·MMS·EMS는 200이고 Web container는 `healthy`다.
- Web container는 `healthy`이고 local/public readiness, Home, EMS, `/visualizer`가 HTTP 200이다. 비인증 analysis API는 401이다.
- 공개 desktop 브라우저에서 EMS 트랙 선택 뒤 Next client navigation이 현재 트랙과 12곡 대기열을 보존하는 것을 확인했다.
- `/visualizer`에서 현재 artwork·제목·아티스트, 이전/재생/다음, 재생 위치, 대기열 전환, 막대/방사형 키보드 전환이 동작했다.
- 비회원 오류는 `로그인 후 실시간 이퀄라이저를 사용할 수 있습니다.`와 `returnTo=/visualizer` 로그인 링크로 표시되고 브라우저 warning/error는 0건이었다.
- EMS pipeline과 source-routines의 container ID·image·시작 시각은 배포 전후 동일하다. DB migration과 worker restart는 없었다.
- 막대 분포 보완 배포 뒤 app browser 연결이 `User unavailable`이라 로그인 live PCM 화면 재확인은 수행하지 못했다. 로그 밴드 분포와 canvas 중앙 정렬은 focused test로 검증했다.
- overlay 전환 배포 뒤에도 app browser 연결이 `User unavailable`이라 로그인 전체 플레이어의 실제 canvas pixel은 자동 확인하지 못했다. 컴포넌트 테스트와 production smoke를 분리해 기록한다.

## 미검증 항목

- browser viewport override가 실제 390x844로 적용되지 않아 mobile은 responsive CSS와 component test까지만 검증했다.
- 로그인된 실제 TIDAL direct MP4·HLS 재생의 PCM 반응, canvas pixel과 브라우저별 codec 지원 범위는 남았다.

## 롤백

- 기능 전체 롤백 기준은 이전 release `/home/approid/apps/music-pie/releases/c76197b`와 image `music-pie-web:pre-visualizer-ca0ce76`이다.
- 막대 분포 보완만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/91b409e`와 image `music-pie-web:pre-visualizer-bars-2226ca9`를 사용한다.
- 위치·높이·동기화 보완만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/b2de0a0`와 image `music-pie-web:pre-visualizer-timing-0e6440c`를 사용한다.
- 시작 지연 보완만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/f922cfe`와 image `music-pie-web:pre-visualizer-start-968cff2`를 사용한다.
- direct 분석 경량화만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/9ec49ca`와 image `music-pie-web:pre-visualizer-analysis-77e7dda`를 사용한다.
- 전체 플레이어 overlay 전환만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/b616ddb`와 image `music-pie-web:pre-embedded-eq-102ffb5`를 사용한다.
- analyser 사전 준비 수정만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/14139e3`와 image `music-pie-web:pre-eq-warm-af30576`을 사용한다.
- live streaming analyser 수정만 되돌릴 때는 release `/home/approid/apps/music-pie/releases/8de5429`와 image `music-pie-web:pre-live-eq-54a5988`을 사용한다.
- 오류 상태 보완까지 되돌릴 때는 release `/home/approid/apps/music-pie/releases/f6392b0`와 image `music-pie-web:pre-visualizer-errors-58ba65e`를 사용한다.
- 롤백 시 Web만 재생성하고 EMS·PostgreSQL·embedding·상시 worker는 재시작하지 않는다.
