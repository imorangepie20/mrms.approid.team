# 현재 개발 상태

최종 갱신: 2026-09-29

최신 기능 기준 커밋: `41c4c2c`

최신 Zorin Web 배포 기준 커밋: `41c4c2c` (하이브리드 추천 shadow ranking)

최신 Zorin audio-analysis 배포 기준 커밋: `db8c230` (긴 TIDAL preview 30초 bounded 분석)

최신 Zorin EMS 배포 기준 커밋: `f4a3402` (bounded TIDAL preview 분석 worker, 상시 source-routines는 기존 container 유지)

## 이번 목표

사용자가 MMS 내부 플레이리스트를 만들고 트랙을 구성하며, TIDAL에서 가져온 플레이리스트와 검색·GMS·EMS에서 좋아요한 트랙·플레이리스트·앨범·아티스트를 탐색하고 재생한다.

## 현재 구현

- 2026-09-29 `41c4c2c`에서 기존 GMS 응답과 순서를 바꾸지 않는 `hybrid-v0` shadow ranking을 구현하고 Zorin에 배포했다. 같은 최대 `limit × 5` 후보에 text·exact-version audio·mood·rhythm similarity와 catalog·freshness를 계산하고, 0.075 같은 artist 감점 Selector를 별도로 실행한다. 사용자·text/audio profile·model provenance, 후보 component와 overlap@K·rank displacement·coverage·fallback을 새 025 테이블에 저장하되 vector·원본 DSP·preview URL·token은 저장하지 않는다. Next.js `after()`의 transaction 실패는 baseline 응답에 영향을 주지 않는다. 전체 Web 128개 파일·488개 테스트, PostgreSQL 25개 migration·통합·025 rollback/재적용, 타입·lint·build를 통과했다. 운영 backup 뒤 025와 Web만 배포했으며 local/public smoke, 비인증 401, 최근 오류 0건과 비-Web container 무중단을 확인했다. 운영 audio profile과 shadow 행은 아직 0이며 `GMS_RANKING_VERSION`·활성화 threshold·보관/정리 정책은 추가하지 않았다. 상세는 `docs/changes/2026-09-29-hybrid-recommendation-shadow-ranking.md`에 기록한다.
- 2026-09-29 `3f4fba3`에서 text 768차원 프로필과 분리된 사용자 오디오 취향 프로필 schema·계산·repository를 구현하고 Zorin에 배포했다. 입력은 사용자별 선택 playlist·TIDAL track 좋아요·GMS accept 중 active EMS에 연결되고 reject되지 않은 곡이며, exact `essentia-dsp-v1`·MAEST 2,304차원 L2·MusicNN 18개 high-level label만 analyzed로 사용한다. 가중치·군집 기준은 text 프로필과 공유하고, DSP·prediction 요약·coverage·SHA-256 fingerprint와 독립 UUID version을 transaction으로 저장한다. GMS·사용자 요청·scheduler에는 연결하지 않았다. Web 전체 123개 파일·474개 테스트, PostgreSQL 통합, 24개 migration과 024 rollback·재적용, 타입·lint·build를 통과했다. 운영 backup 뒤 024와 Web만 배포했으며 읽기 전용 교집합은 eligible 6·analyzed 0이라 profile을 생성하지 않았다. public smoke와 인증 경계, 오류 로그 0건을 확인했고 Web 외 container는 유지했다. 상세는 `docs/changes/2026-09-29-user-audio-taste-profile-shadow.md`에 기록한다.
- 2026-09-29 `db8c230`에서 8곡 bounded audio sample cohort를 실행하고 긴 TIDAL preview 처리 오류를 수정했다. 첫 실행은 provider 요청 17/17에서 7곡 completed, 1곡 `analysis_preview_too_long`이었으며 실패 입력은 저장 없이 메모리 pipe로 측정한 결과 약 60.005초의 정상 `PREVIEW`였다. audio-analysis는 4MiB request cap과 20초 timeout을 유지한 채 FFmpeg에서 앞 30초만 decode·분석하도록 변경했다. 수정 뒤 실패곡을 요청 3회로 재처리해 최종 sample 8/8, 전체 job 9/9 completed를 확인했다. 모든 결과는 30초·16kHz mono·segment 3·coverage 1.0·2,304차원 L2 embedding·prediction 28개이며 오류·대기 job은 0이다. audio-analysis만 교체했고 Web·PostgreSQL·embedding·EMS·source-routines·tunnel은 재시작하지 않았다. 상세는 `docs/changes/2026-09-29-audio-analysis-sample-cohort.md`에 기록한다.
- 2026-09-29 `e1bbe73`에서 `/admin/audio-analysis`와 관리자 API를 추가하고 Zorin Web release로 배포했다. 활성 EMS 39,102곡의 분석 coverage와 상태·feature/model version·오류·7일 처리량을 집계하며, 트랙 상세는 preview hash·DSP·prediction과 embedding metadata만 제공하고 URL·token·embedding vector는 노출하지 않는다. 재처리는 활성 numeric-TIDAL 트랙 한 건과 정확한 `essentia-dsp-v1` version으로 제한하고 `running` job은 거부하며 기존 결과는 보존한다. Web 전체 120개 파일·463개 테스트와 PostgreSQL 통합 1개, Admin 12개 테스트, lint 오류 0, 두 production build를 통과했다. 운영 Web만 교체했고 local/public health 200, 비인증 관리자 화면 307·API 401, 최근 Web 오류 0건과 desktop·`390x844`·키보드 탐색을 확인했다. PostgreSQL·embedding·audio-analysis·EMS·source-routines·tunnel은 재시작하지 않았다. 상세는 `docs/changes/2026-09-29-audio-analysis-admin-observability.md`에 기록한다.
- 2026-09-29 `2ccd756`에서 `023_ems_audio_analysis.sql`과 `ems-pipeline analyze-audio`를 추가하고, 실제 TIDAL preview의 codec padding 보정 `f4a3402`까지 Zorin release로 배포했다. migration은 기존 39,102개 active EMS를 자동 enqueue하지 않으며 기본 worker 실행은 stage 16·batch 1·최대 1 batch·provider 요청 3회로 제한된다. preview 원본·signed URL·token은 저장·로그하지 않고, lease·retry·중단 반환·동일 hash 재사용·분석 응답 검증 뒤 transaction 저장을 적용했다. 실제 canary 1건은 30초·16kHz mono·구간 3개·2,304차원 L2 norm 1.0·prediction 28개로 완료됐고 실패·대기 작업은 0이다. 최종 audio-analysis·EMS는 healthy, restart 0, 오류 로그 0건이며 Web·DB·embedding·source-routines·tunnel은 재시작하지 않았다. 상세는 `docs/changes/2026-09-29-ems-audio-preview-worker.md`에 기록한다.
- 2026-09-29 `d436199`에서 내부 `services/audio-analysis`를 구현하고 Zorin에 배포했다. `audio-preprocess-v1`은 기본 4MiB request cap, SHA-256 대조, FFmpeg mono 16kHz decode, 최대 30초와 20초 timeout, 전체·10초 구간 신호 요약을 제공한다. 8개 fixture·경계 테스트와 Docker build를 통과했고 운영 1초 440Hz WAV는 HTTP 200, duration 1.0초, RMS `0.35354234`로 분석됐다. 서비스는 healthy, 최근 오류 0건이며 UID 10002, read-only, capability 제거, 포트 미공개, backend internal network 전용으로 실행한다. 기존 Web·DB·embedding·EMS·tunnel은 재시작하지 않았다. 모델 artifact가 아직 고정되지 않아 `embedding: null`, `predictions: []`를 명시하며 Essentia·MAEST·MusiCNN, preview worker, DB와 추천 반영은 다음 단계다. 상세는 `docs/changes/2026-09-29-audio-analysis-service-scaffold.md`에 기록한다.
- 2026-09-29 `08f63cb`에서 30초 프리뷰 오디오 분석 설계를 공개 구현에 맞춰 개정했다. 1차 스택은 `Essentia DSP + MAEST 30초 + 필요한 MusiCNN head`이며 text 768차원과 audio model-native vector를 별도 공간으로 유지한다. 추천은 Source → Hydrator → Filter → Scorer → Selector → SideEffect로 분리하고 다양성은 Selector, 노출 기록은 비동기 SideEffect에 둔다. 별도 audio-analysis service, `023`·`024` migration, bounded worker, 관리자 관측, shadow ranking과 제한 활성화의 파일별 구현 계획은 `docs/plans/2026-09-29-audio-preview-analysis-implementation.md`에 기록했다. 관리자 4개 파일·9개 테스트, lint 오류 0, 관리자와 Web production build를 통과하고 Zorin Web release `08f63cb`로 배포했다. local/public 주요 경로와 health는 200, 관리자 인증 경계는 307, 새 asset은 200, Web 최근 오류는 0건이며 PostgreSQL·embedding·EMS·tunnel은 재시작하지 않았다. 현재 변경은 문서와 관리자 요약이며 오디오 runtime·DB·hybrid serving은 아직 구현하지 않았다. 상세는 `docs/changes/2026-09-29-audio-preview-analysis-design-revision.md`에 기록한다.
- 2026-09-29 `eee723f`에서 현재 TIDAL 플레이리스트·메타데이터·좋아요·GMS 결정 기반 취향 분석과 30초 프리뷰 오디오 분석 확장안을 `docs/overview/taste-analysis-system.md`로 통합했다. 관리자 `/admin/taste-analysis`와 `추천·취향 → 취향 분석 설계` 메뉴에서 현재 가중치·군집, 오디오 지표, 결합 점수, 처리 자원과 단계별 도입 순서를 읽을 수 있다. 관리자 4개 파일·9개 테스트, lint 오류 0, 관리자와 Web production build를 통과하고 같은 release를 Zorin Web에 배포했다. local/public 주요 경로와 health는 200, 관리자 인증 경계는 307, 새 asset은 200이며 Web은 healthy다. PostgreSQL·embedding·EMS·tunnel은 재시작하지 않았다. 오디오 수집·분석·DB·추천 반영은 문서 제안 상태이고 실제 로그인 관리자 브라우저 시각 검증은 남았다. 상세는 `docs/changes/2026-09-29-taste-analysis-admin-document.md`에 기록한다.
- 2026-09-28 `7431f14`에서 music-pie 내부 MMS 플레이리스트 생성·이름/설명 수정·삭제와 트랙 추가·제거·위/아래 순서 변경을 구현했다. 내부 데이터는 가져온 TIDAL 플레이리스트·EMS·좋아요와 분리하고 사용자 소유권, 중복, 순서 제약을 DB와 API에서 검증한다. 검색·EMS·GMS·MMS의 주요 트랙 UI에서 추가할 수 있다. 전체 Web 116개 파일·450개 테스트, lint 오류 0, production build를 통과했고 `8b87412` release로 운영 배포했다. DB backup과 `022_mms_playlists.sql` 적용, 기존 사용자·TIDAL·EMS 집계 보존, local/public smoke, 로그인 MMS 생성 폼, EMS·DB 컨테이너 무중단을 확인했다. 상세는 `docs/changes/2026-09-28-mms-playlist-management.md`에 기록한다.
- 2026-09-28 `f930cbf`에서 온보딩의 일반 TIDAL OAuth 연결 뒤 첫 재생에서 Device 승인을 다시 요구하던 이중 인증 흐름을 제거했다. 최초 연결은 재생 가능한 Device 승인 한 번으로 플레이리스트와 전체 재생을 함께 연결하며, `/tidal-connection`은 Device scope가 저장된 경우에만 완료로 판정한다. 운영 로그인 계정은 추가 승인 없이 연결 완료로 판정됐고 MMS 실제 트랙이 `0:02/4:32`까지 재생됐으며 browser error 0건이었다. 상세는 `docs/changes/2026-09-28-tidal-single-authorization.md`에 기록한다.
- 2026-09-28 `635aa7c`에서 관리자 sidebar를 1536px 미만 off-canvas, 1536px 이상 persistent 구조로 바꿔 내부 페이지 breakpoint와 실제 본문 폭을 일치시켰다. `7032b1f`에서는 Docker image에 이전·신규 관리자 자산이 함께 남아 오래된 JS가 선택되던 원인을 제거하고 JS·CSS 각각 1개를 강제했다. 운영 1024px drawer, 1272px 핵심 10개 경로, 1536px 확장·접기에서 document overflow 0, console error 0을 확인했다. Web만 교체했고 EMS 서비스와 DB는 유지했다. 상세는 `docs/changes/2026-09-28-admin-shell-responsive-layout.md`에 기록한다.
- 2026-09-28 `6f48993`에서 관리자 Spotify 차트 화면의 4열 전환을 sidebar 폭을 고려한 `2xl`로 늦추고 main·카드·통계 값의 축소·줄바꿈 경계를 보강했다. 운영 1280px는 2열, 1536px는 4열이며 두 크기 모두 `scrollWidth=clientWidth`, 액션·실행 ID 잘림 0건, console error 0건이다. Web만 교체했고 EMS worker와 source-routines는 유지했다.
- 2026-09-28 `d0632d0`에서 Spotify 추천 차트의 네 playlist를 관리자 `/admin/ems/spotify`에서 bounded 실행하고 public EMS `Spotify 차트`에 전시하도록 추가했다. 운영 run `8ca016f7-dac0-4604-b18b-6b1f49f68536`은 Spotify `4/4`, TIDAL `121/450`, source membership 200, unique 후보 110, matched 91, not_found 19로 완료됐다. playlist별 public 전시는 `46/36/45/38`곡이고 duplicate 0, active snapshot 1이다. 기존 active EMS 39,035곡과 사용자 집계 `1,5,0,1`을 dump 복원으로 대조했으며 배포 후 사용자 집계는 동일하고 active EMS만 39,099곡으로 증가했다. 상세는 `docs/changes/2026-09-28-spotify-chart-import.md`에 기록한다.
- 2026-09-28 `be3c8e5`에서 GMS 개별 트랙 추천을 카드 rail에서 곡·아티스트·앨범·결정 액션이 구분된 세로 목록으로 전환하고, `8822341`에서 추천 수락을 `+ MMS`, 싫어요를 접근성 이름과 tooltip을 갖춘 Lucide `ThumbsDown` 아이콘으로 축약했다. 트랙 선택 시 GMS 추천 전체를 대기열로 설정하며 desktop과 `390x844`에서 12개 목록 행·축약 액션, 기존 카드·rail 0개, mobile overflow·action 잘림 0건과 browser 오류 0건을 확인했다. 현재 GMS 계약은 `Track[]`만 제공하므로 가짜 앨범·플레이리스트 데이터를 만들지 않았고 실제 컬렉션 엔터티는 카드형으로 표시하는 원칙을 유지한다. 상세는 `docs/changes/2026-09-28-gms-entity-layout.md`에 기록한다.
- 2026-09-28 `d33d8fb`에서 앨범·플레이리스트의 셔플 큐 생성과 첫 곡 load를 provider의 원자적 `playQueue`로 통합하고, 재생 불가 곡 제외·순서 변화 보장·일반 큐 전환 시 셔플 해제를 적용했다. EQ는 실제 analyser RMS 에너지를 저역 중앙·고역 양쪽의 48개 대칭 막대로 다시 구성했다. 로그인 public MMS 31곡에서 무작위 첫 곡과 섞인 다음 곡 재생, `pcm` canvas 변화, desktop·`390x844`, browser 오류 0건을 확인했다. 상세는 `docs/changes/2026-09-28-shuffle-equalizer-reimplementation.md`에 기록한다.
- 2026-09-28 `fa3e1ab`에서 검색 완료 즉시 제시어를 닫던 `94657c3`의 부자연스러운 동작을 교체했다. 현재는 검색 결과와 제시어를 함께 유지하고, 검색창·제시어 이외 영역 클릭 또는 `Escape`에서 닫으며, 검색창을 다시 누르거나 focus하면 보존한 제시어를 다시 연다. public Search의 결과·제시어 동시 표시, 외부 클릭·`Escape` 닫기와 Web health를 확인했고 오래된 응답 차단·새 입력·탭 선택·검색 실패 fallback은 유지한다. 상세는 `docs/changes/2026-09-28-search-suggestion-outside-dismissal.md`에 기록한다.
- 2026-09-28 `78d028b`에서 일반 TIDAL OAuth 재연결이 같은 사용자의 전체 재생 Device 세션을 덮어써 `TIDAL 재생 연결` 버튼이 반복되던 원인을 수정했다. 동일한 TIDAL 사용자 ID와 갱신 가능한 Device scope를 transaction에서 확인해 기존 재생 자격 증명을 보존하며, 다른 계정·확인 불가 ID·갱신 불가능한 만료 세션은 보존하지 않는다. Web만 배포했고 local/public Home·MMS·EMS·readiness와 로그인 MMS 렌더링을 확인했다. DB schema와 사용자·EMS 데이터 변경은 없다. 상세는 `docs/changes/2026-09-28-tidal-playback-session-preservation.md`에 기록한다.
- 2026-09-27 `211a97f`에서 Home 상단을 `21st.dev`의 셰이더 히어로 방향으로 재구성했다. 잠긴 예제 소스 대신 공식 `@paper-design/shaders-react@0.0.67`의 `MeshGradient`를 사용하고 관리자 hero 콘텐츠, 실제 EMS 선곡과 이하 Home 흐름은 유지했다. `72e7677`, `45e0a6c`에서는 `390x844` 운영 확인으로 찾은 기존 검색·인증·페이지 제목 겹침을 기능 손실 없이 보정했다. desktop/mobile 셰이더, 다음 영역 노출과 console error 0건을 확인했고 WebGL fallback, 감속 모드, 긴 문구 줄바꿈을 포함한다. 상세는 `docs/changes/2026-09-27-home-shader-hero.md`에 기록한다.
- 2026-09-27 `58ba65e`에서 사용자가 소유한 `imorangepie20/my-forever-music`의 Visual EQ 구조를 Music Pie에 맞게 이식했고, `2226ca9`에서 막대형 FFT를 로그 주파수 밴드와 고역 gain으로 재분배했다. `0e6440c`에서는 막대를 오른쪽으로 2.5% 이동하고 최대 높이를 줄였고, `968cff2`에서는 늦은 HLS 구독에 마지막 media segment 1개를 즉시 재전달하면서 임시 timing advance를 제거했다. `77e7dda`에서는 재생 음질은 유지하고 direct 분석 요청만 `LOW`로 고정해 첫 반응 대기량을 줄였다. `102ffb5`에서는 독립 EQ 화면과 compact player 링크를 제거하고 전체 플레이어 앨범 아트 하단에 반투명 막대 overlay를 배치했으며 `/visualizer`는 Home으로 전환한다. `54a5988`에서는 전체 파일 decode 대기를 없앤 same-origin live streaming analyser를 적용했고, 운영 캡처를 기준으로 overlay를 27%로 줄이고 포화되던 고역 gain을 낮춘다. 분석 API는 인증·`no-store`·48MiB hard cap을 적용하며 signed URL과 token을 저장·로그하지 않는다. 상세는 `docs/changes/2026-09-27-visual-equalizer.md`에 기록한다.
- 2026-09-27 1,000곡 품질 gate를 근거로 10,000곡 cohort와 MusicBrainz snapshot delta 운영을 설계·검토했고 결정은 `HOLD_10K`다. 기준 run은 `paused`, matched `154`, pending `806`, retryable `40`이며 1k 완료·사용자 승인과 로그인 browser decode가 남았다. 1k 종료는 `846곡/36 batch/GET 1,800`, 10k 확대는 신규 `9,000곡/375 batch/GET 18,000` hard cap으로 제안했으며 이번 외부 요청·DB write·scheduler 변경은 0건이다. 기존 scheduler의 무제한 snapshot resolver, 승인 없는 resume, 상태·disk·embedding 관측 부족을 선행 차단 조건으로 기록했다. 상세는 `docs/changes/2026-09-27-ems-10k-snapshot-diff-gate.md`에 있다.
- 2026-09-27 `951fb9a`에서 matched 승격의 stale 오류 정리, rate-limit·budget 중단 시 미처리 claim 복구, embedding 실제 잔여 집계를 추가했다. 승인된 resolver 24곡은 24/24 matched, catalog GET 24/50이었고 최종 1,000곡 분류는 matched 154, pending 806, retryable 40, 나머지 0으로 run을 `paused`로 남겼다. 전수 false-match 0/154, target embedding 154/154, 전체 미완료 0, playback media 표본 20/20, 격리 restore와 사용자·기존 active 보존을 확인했다. 상세는 `docs/changes/2026-09-27-editorial-resolver-quality-gate.md`에 기록한다.
- 2026-09-27 배포된 Home·EMS를 desktop과 `390x844` mobile에서 bounded browser QA했다. Home 3개, EMS 5개 section이 각각 12곡이고 API/UI `totalCount=38,762`, section 전역 중복 0을 확인했다. rail keyboard·mobile swipe, focus ring, 비회원 재생 recovery, 검색 전환·빈 상태·복귀, 제거된 platform filter, 문서 overflow와 고정 UI를 검증했으며 blocking 결함은 0건이다. 검색 오류 문구 회귀 테스트를 추가했다. 상세는 `docs/changes/2026-09-27-home-ems-browser-qa.md`에 기록한다.
- 2026-09-27 `7e79ad2bd9af`에서 editorial sync를 전역 track 중복 제거, section당 최대 12곡, 최소 4개×6곡 fail-closed gate, 전체 section 단일 transaction으로 강화했다. 운영 dry-run과 actual sync 모두 5개 section×12곡이었고 DB/API 중복 0, local/public health·sections API·Home·EMS 200을 확인했다. Web만 새 release로 교체했으며 상시 EMS worker와 source-routines container는 이전 image에서 중단 없이 유지했다. 상세는 `docs/changes/2026-09-27-editorial-section-sync-release.md`에 기록한다.
- 2026-09-27 resolver 확장 뒤 editorial section dry-run을 `playlist-limit=2`, request budget `24`, timeout `8초`로 다시 실행했다. `new-releases 39/25/0`, `seasonal-jazz 38/38/0`, `night-rnb 39/28/0`, `feel-good 34/30/0`, `focus 26/26/0`(`discovered/joined/stored`)으로 projected stored 기준 `5/5` section이 6곡 이상이라 gate를 통과했다. 기존 section `10`·membership `113`의 전후 fingerprint, release와 서비스 상태는 동일하며 실제 membership write와 release 전환은 하지 않았다. 상세는 `docs/changes/2026-09-27-editorial-dry-run-after-resolver.md`에 기록한다.
- 2026-09-27 `38c22ae0f47e`에서 resolver의 active editorial section 조인 후보 우선 처리, catalog GET 사용량 출력, 누적 matched count 갱신을 추가했다. 운영에서 승인된 24곡 단일 batch를 실행해 24/24 matched, catalog GET 24/50, ambiguous/not_found/unavailable/retryable/budget_exhausted 0을 기록했다. DB는 matched 130, pending 830, retryable 40, resolving 0으로 일치하고 run은 `paused`다. 상세는 `docs/changes/2026-09-27-editorial-priority-resolver-batch.md`에 기록한다.
- 2026-09-27 `bc47ed34e971`에서 비회원 재생 오류의 내부 `unauthorized` 코드를 한국어 안내와 로그인 진입점으로 교체했다. 운영 Web만 재배포했고 공개 Home·EMS·readiness, 컨테이너 health, 실제 EMS 트랙 선택 뒤 `returnTo=/ems` 로그인 링크와 내부 코드 비노출을 확인했다. 이전 `c7a002d` release와 Web 이미지는 롤백용으로 보존했다. 상세는 `docs/changes/2026-09-27-anonymous-playback-error.md`에 기록한다.
- 2026-09-26 사용자 TIDAL 트랙 좋아요와 GMS 추천 수락·거절을 개인 취향 프로필에 반영하도록 로컬 구현했다. 좋아요의 완료 EMS 임베딩을 재사용하고 EMS·사용자 라이브러리에 없는 TIDAL 좋아요는 메타데이터 스냅샷으로 계산 중 임베딩한다. 긍정 액션 트랙은 기본 가중치의 2배로 반영하고 거절 이력은 긍정 피드백과 GMS 후보에서 제외한다. Web build·lint와 diff 검사는 통과했다. 2026-09-27 운영 GMS 추천 카드 표시는 확인했으며 액션 재계산 코드는 미배포 상태라 액션 검증은 남았다. 상세는 `docs/changes/2026-09-26-user-action-taste-profile.md`에 기록한다.
- 2026-09-26 관리자 공개 URL 수집·검토 경로를 로컬 구현했다. 관리자 Melon 장르·TIDAL track/album/playlist URL 제출, 원본·항목 출처와 수집 시각 저장, 곡별 승인·제외, 기존 EMS resolver 연동을 추가했다. 운영 migration·배포와 live URL·관리자 브라우저 검증은 남아 있다. 상세는 `docs/changes/2026-09-26-admin-url-import.md`에 기록한다.
- 2026-09-26 `4e1fd371e97b`에서 전체 플레이어 대기열에 앨범 아트·앨범명·재생 시간을 추가했다. Web build·TypeScript와 운영 Web healthy·readiness를 확인했다. 실제 로그인 화면의 시각 확인은 남았다. 상세는 `docs/changes/2026-09-26-full-player-queue-details.md`에 기록한다.
- 2026-09-26 `3ccc0d25f5ed`에서 멜론 수집을 최대 100곡씩 처리하고 후보 확인 완료 60초 후 체크포인트에서 자동 재개하도록 변경했다. 운영 `019_ems_melon_batches.sql` 적용, DB 백업 확인, Web·EMS 배포와 기존 작업 재개를 완료했다. 기존 후보 131곡을 모두 처리한 뒤 60초 대기와 다음 100곡 자동 조회를 관찰했다(누적 발견 1,650→1,750곡). 상세는 `docs/changes/2026-09-26-melon-100-track-batches.md`에 기록한다.
- 2026-09-26 `dd6a9e993abe`에서 멜론 한국대중음악 8개 장르 최신곡 목록 수집, 원천곡·장르·출처 보존, TIDAL 확인 뒤 EMS 승격, 관리자 `/admin/ems/melon`과 24시간 정기 수집을 추가했다. 운영 DB 백업 뒤 `018_ems_melon_genres.sql`을 적용하고 Web·EMS 이미지를 배포했다. 건강 상태와 인증 경계를 확인했다. 실제 장르별 수집·매칭 결과는 진행 중이다. 상세는 `docs/changes/2026-09-26-melon-genre-ingestion.md`에 기록한다.
- 2026-09-26 `d7fdfe6`에서 메인에 사이트 개념·3단계 이용법·음악 이야기 카드와 기존 EMS 선곡을 배치했다. 관리자 메인 화면 관리에서 문구·링크·순서·노출을 편집하고 음악 이야기를 추가·삭제한다. 운영에 `017_home_content.sql`을 적용했고 공개 콘텐츠 7건, Web healthy, 관리자 저장 표시를 확인했다. 모바일 화면 크기 전환이 브라우저 도구에 적용되지 않아 모바일 시각 검증은 남았다. 상세는 `docs/changes/2026-09-26-home-content.md`에 기록한다.
- 2026-09-25 `9884548`에서 전체 플레이어를 현재 곡 중심의 2열 카드·대기열 박스로 재구성했다. 모바일은 1열로 현재 곡 정보가 첫 화면에 보인다. 운영에서 실제 곡 재생 중 데스크톱·390×844 모바일 화면, Web healthy를 확인했다. 상세는 `docs/changes/2026-09-25-full-player-visual-refresh.md`에 있다.
- 2026-09-25 `24bf96f`에서 회원 Auth0 로그인 뒤 사용자별 TIDAL 연결 상태 화면을 반드시 거치게 했다. 연결된 회원은 재동의 없이 원래 요청한 회원 화면으로 계속하고, 관리자 로그인은 관리자 화면으로 돌아간다. 운영에서 실제 Auth0 SSO 콜백과 연결 상태 화면, 관리자 복귀, Web healthy를 확인했다. 미연결 계정 화면의 실제 브라우저 확인은 남았다. 상세는 `docs/changes/2026-09-25-member-login-tidal-checkpoint.md`에 있다.
- 2026-09-25 `81af208`에서 관리자 화면을 Auth0 세션과 `ADMIN_AUTH0_SUBJECTS`로 보호하고, 관리자에게만 회원 화면의 관리자 링크를 표시했다. 관리자는 회원 화면도 사용한다. 운영에서 비로그인 관리자 화면의 로그인 이동, 관리자 API 401, 로그인된 관리자 화면과 회원 홈 링크, Web healthy를 확인했다. 일반 회원 계정의 404 직접 확인은 남았다. 상세는 `docs/changes/2026-09-25-admin-member-separation.md`에 있다.
- 2026-09-24 `7dc93dd`에서 관리자 EMS 수집 화면의 전체 활성곡과 현재 실행 중 작업, 대기 중 수동 작업을 분리했다. 최근 12시간 활성곡 유입과 현재 작업의 후보·처리·매칭 그래프를 DB 시각으로 복원한다. 운영에서 MusicBrainz 작업 진행 중·수동 TIDAL 작업 대기, 그래프와 DB 수치, Web healthy를 확인했다. 상세는 `docs/changes/2026-09-24-ems-ingestion-monitor-fix.md`에 있다.
- 2026-09-24 `838bf74`에서 MusicBrainz 메타데이터 자동 갱신을 추가하고 Zorin에 배포했다. `016_ems_musicbrainz_metadata_routine.sql`을 적용했고 `ems-source-routines`가 6시간마다 새 활성곡과 core 버전을 확인한다. 첫 실행은 14,427곡, 신규곡 확인을 위한 두 번째 실행은 323곡만 처리했다. 운영 확인 시점 태그 보유곡은 2,684→3,710곡, MusicBrainz 최초 발매일 보유곡은 0→8,287곡으로 늘었고 다음 자동 확인은 2026-09-24 18:44 KST다. 상세는 `docs/changes/2026-09-24-musicbrainz-metadata-refresh.md`에 기록한다.
- 2026-09-24 관리자 `/admin/ems/statistics`에 MusicBrainz 태그·TIDAL 앨범 발매 연대·EMS 유입일의 보유율과 그래프를 추가했다. TIDAL 원천 상세 메타데이터와 태그 원문·투표 수·스냅샷을 저장한다. 운영 확인 시점 활성 8,525곡 중 발매일 8,524곡, 태그 2,684곡이며 수집은 계속 진행 중이다. 운영 적용·권리·미검증 사항은 `docs/changes/2026-09-24-ems-metadata-statistics.md`에 있다.
- `apps/web`에 Next.js 기반 사용자 화면, Auth0 인증, TIDAL 검색·플레이리스트·재생 API가 구현되어 있다.
- 검색 결과는 통합 결과, 트랙, 앨범, 플레이리스트, 아티스트 탭으로 구성된다.
- 검색의 앨범·플레이리스트를 선택하면 상세 트랙 목록, 전체 재생, 셔플을 제공하며 뒤로가기로 검색 상태를 복원한다.
- 검색·EMS·MMS 트랙 목록은 공통 `TrackList`를 사용한다.
- 공통 트랙 목록은 재생 중인 트랙의 행·제목·상태 아이콘을 강조하고 일시 정지 중에도 현재 트랙을 유지해 표시한다.
- TIDAL 검색 트랙에 `STREAM` availability가 없으면 목록에서 재생을 비활성화하고 전체 재생·셔플 큐에서도 제외한다.
- 전역 재생 세션은 큐, 이전/다음, 셔플, 전체/한 곡 반복, 볼륨, 음소거, 재생 위치를 관리한다.
- 전체 재생은 별도 TIDAL Device Code 세션으로 `FULL` playback manifest를 발급하고 `HTMLAudioElement`와 `hls.js`로 재생한다.
- 같은 TIDAL 계정의 일반 OAuth 재연결은 갱신 가능한 Device Code 세션을 보존한다. TIDAL 사용자 ID가 다르거나 확인되지 않으면 이전 재생 세션을 승계하지 않는다.
- Device Code 승인 완료 시 실패했던 현재 큐 항목을 자동으로 다시 로드해 연결 버튼과 오류 상태를 해제한다.
- 전역 플레이어는 큐와 셔플·반복 상태를 유지하며 seek, 볼륨, 음소거, 이전·다음 곡을 제어한다.
- 사용자 좋아요는 가져온 라이브러리와 GMS 추천 수락·싫어요와 분리해 트랙·플레이리스트·앨범·아티스트 네 유형으로 영구 저장한다.
- 검색·EMS·GMS의 하트는 재생·상세 열기·추천 수락과 분리되어 있고, GMS의 추천 결정 문구는 `추천 수락`이다.
- MMS는 `My Music Space`를 페이지 제목으로 사용하고, TIDAL에서 가져온 플레이리스트 카드를 가장 먼저 표시해 DB에 저장된 수록곡으로 상세·전체 재생·셔플을 제공한다.
- 좋아요는 MMS의 부속 콘텐츠다. 가져온 플레이리스트 아래에 네 좋아요 유형의 요약·섹션·독립 빈 상태를 표시하고, 좋아요 해제를 카드·개수에 즉시 반영한다.
- MMS의 TIDAL 플레이리스트·앨범 카드는 catalog API로 트랙을 불러오는 인라인 상세와 전체 재생·셔플을 제공한다.
- TIDAL 연결 해제 후에도 사용자 좋아요와 기존 저장 라이브러리 데이터는 유지된다.
- 실제 PostgreSQL에 `002_tidal_connection_runtime.sql`, `003_user_music_library.sql`, `005_user_likes.sql`이 적용되어 있다.
- MusicBrainz ISRC 조회의 잘못된 `release-groups` 파라미터를 제거했고, 아티스트별 장르·태그 보강과 공용 캐시를 구현했다. `006_musicbrainz_genres.sql`을 실제 PostgreSQL에 적용했으며 저장 트랙 101곡의 보강 잡이 모두 완료됐다. 이 중 49곡에 장르가 채워졌고 아티스트 캐시 64건이 저장됐다.
- 추천 임베딩 입력용 `buildEmbeddingText`는 제목·아티스트·앨범에 `mb_genres`를 붙인다. 장르가 없을 때는 공용 장르 어휘에 포함된 `mb_tags`만 최대 3개 사용해 국가·시대·사건 등 비장르 태그를 배제한다.
- `paraphrase-multilingual-mpnet-base-v2`를 revision에 고정한 비루트 임베딩 서비스를 구현했다. 트랙 입력은 768차원 L2 정규화 vector로 저장되며 잡 claim·lease·재시도 상태를 기록한다.
- 사용자 취향 프로필은 사용자별 트랙 vector의 가중 중심과 최대 3개 군집 중심을 계산하고, 온보딩 화면은 MusicBrainz 보강·임베딩·프로필 준비 상태를 순서대로 표시한다.
- TIDAL 온보딩은 선택한 플레이리스트의 예상 트랙 수와 `15곡 최소`·`30곡 권장`·`60곡 다중 취향` 기준을 표시한다. 가져오기 후 사용자별 고유 트랙이 15곡 미만이면 첫 추천 준비를 완료하지 않는다.
- 공개 주소는 `https://mrms.approid.team/`다. production은 Zorin OS의 Docker Compose에서 실행되며 Web loopback port는 `3104`다. Windows의 기존 `44119` Web과 tunnel connector는 중지했고 PostgreSQL 원본 volume은 rollback용으로 유지했다.
- 초기 개인화 추천 전략과 사용자별 영구 제외 규칙은 기존 결정 문서를 따른다.
- 2026-09-21 사용자가 TIDAL Developer Terms의 AI 서비스 제한 제약을 해소했다. 테스트 배포까지 가져온 TIDAL 트랙 메타데이터를 취향 분석 임베딩 입력으로 사용할 수 있다. 근거는 `docs/changes/2026-09-21-tidal-ai-analysis-allowed.md`에 있다.
- 2026-09-22 MusicBrainz 공식 CC0 snapshot에서 EMS 후보를 생성하고 `008_ems_catalog.sql`과 tracked migration runner를 Zorin에 적용했다. 카탈로그용 `TIDAL_CLIENT_ID`·`TIDAL_CLIENT_SECRET`를 승인된 secret 경로에 추가하고 token smoke를 HTTP 200으로 확인했다. TIDAL v2 검색은 `filter[query]`·관계형 `tracks` 응답으로 수정했으며, bounded canary의 결과를 커밋·일시정지 상태로 기록한다. 상세 결과는 `docs/changes/2026-09-22-ems-catalog-ingestion.md`와 `docs/runbooks/ems-catalog-ingestion.md`에 있다.
- 2026-09-22 TIDAL 공개 에디토리얼 대중성 입력으로 1,000곡 artifact를 재생성했다. 같은 ISRC의 여러 에디션은 결정적 우선순위로 하나를 선택하며, 신규 20곡 bounded canary는 재시도 포함 20/20 matched, ambiguous/not_found/unavailable 0이었다. 전체 run은 승인 전까지 paused다.
- Home과 EMS가 같은 TIDAL 에디토리얼 section API와 rail을 사용하도록 구현했다. Home은 상위 3개, EMS는 최대 5개와 별도 검색 모드를 제공하며, 최신 KR `STREAM` availability와 전역 중복 제거를 적용한다. Zorin에는 009 스키마만 비파괴 적용했고 live data gate 실패로 UI release 전환은 보류했다.
- 2026-09-22 GMS fixture 추천을 실제 EMS·사용자 taste profile 연결로 교체했다. 완료된 profile의 전체/군집 중심 유사도와 `ems-v1` 점수, 사용자별 보유·수락·영구 거절 제외를 적용하며, 인증된 수락·거절은 `user_recommendation_decisions`에 기록한다. 실제 completed profile을 이용한 production browser 검증은 아직 남아 있다. 상세 결과는 `docs/changes/2026-09-22-gms-personalized-recommendations.md`에 기록했다.
- GMS 프로필이 준비됐지만 후보가 0곡인 경우에는 `결정 대기 중 0곡` 대신 후보 소진 안내와 EMS 카탈로그 링크를 표시한다. 프로필 미완료·API 오류 상태와 구분하며 회귀 테스트를 추가했다.
- GMS 추천 카드에는 서버의 `taste_match`·`fresh_release` reason code를 `취향 일치`·`최근 발매` 라벨로 표시해 추천 근거를 확인할 수 있게 했다.
- 2026-09-22 GMS 개인화 추천 Web release `12e4050`를 Zorin에 배포했다. 공개 `/gms`·health는 200, 비로그인 추천 API는 401로 인증 경계를 확인했다. 로그인된 completed profile의 실제 추천 카드와 결정 저장 브라우저 검증은 아직 남아 있다.
- 2026-09-22 Zorin의 active EMS 2,159곡에 `paraphrase-multilingual-mpnet-base-v2` 768차원 임베딩을 배치 처리했다. `ems_track_embeddings` completed 2,159건을 확인했으며, 임베딩 원문은 저장하지 않고 model revision·input hash·vector만 기록한다. 이후 운영 계정의 101곡 임베딩과 `taste-v1` 프로필을 완료해 전체 중심 1개·군집 중심 2개를 저장했다.
- 2026-09-23 에디토리얼 section dry-run의 조회 지연을 bounded request budget/timeout과 playlist page cap으로 제한했다. 검증 이미지 `music-pie-ems-pipeline:editorial-20260923`로 5개 section 중 4개가 6곡 이상 조인되어 실제 membership sync를 수행했고, 이전 `temporary-*` placeholder section 5개는 비활성화했다. 현재 API는 `new-releases`, `seasonal-jazz`, `night-rnb`, `feel-good` 4개를 반환하며 `focus`는 조인 0곡이라 제외한다. DB membership 중복은 0건이고 readiness·Home·EMS HTTP smoke는 200이다. 이후 bounded 수집으로 활성 EMS 2,173곡, 임베딩 완료 2,159곡, 대기 14곡, 아트워크 누락 2곡을 확인했다.
- 2026-09-23 공개 브라우저 QA에서 Home 상위 3개 rail, EMS 총 2,159곡·4개 section·album art, GMS profile-not-ready 상태를 확인했다. 실제 TIDAL OAuth 연결과 플레이리스트 분석은 사용자 권한 승인 후 수행해야 한다.
- 2026-09-23 온보딩 화면을 음악 중심 히어로·진행 rail·선택 상태 강조·반응형 레이아웃으로 개선했다. 변경 영향 범위 테스트 15개와 ESLint, Impeccable detector를 통과했다. OAuth 후 운영 DB에서 TIDAL 연결 `connected=1`, 플레이리스트 3개·고유 트랙 101곡을 확인했고 실제 임베딩·취향 프로필 완료까지 처리했다.
- 2026-09-23 운영 계정 취향 분석을 완료했다. `user_taste_profiles`는 `completed|101`, `user_taste_centroids`는 3개이며, GMS 유사도 조회 대상 후보는 active·KR STREAM 기준 2,159곡이다. 상세 결과는 `docs/changes/2026-09-23-taste-profile-completion.md`에 기록했다.
- 2026-09-23 GMS의 프로필 미완료·후보 소진·오류 빈 상태를 음악형 패널과 다음 행동 CTA로 개선했다. 카드 재생·안내 아이콘도 CSS 기반으로 통일했으며 관련 온보딩·GMS 테스트 25개, ESLint, Impeccable detector, diff 검사를 통과했다.
- 2026-09-23 Home·EMS·GMS 트랙 카드 레일을 공통 `TrackRail`로 통합했다. 브라우저 스크롤바를 숨기고 좌우 `scrollBy` 이동 버튼·키보드 방향키·Home/End·reduced-motion 경로를 추가했으며, 긴 메타데이터가 레일 폭을 흔들지 않도록 카드 폭과 텍스트 클램프를 고정했다. 전체 339개 테스트, build, ESLint, Impeccable detector를 통과했다. 상세 결과는 `docs/changes/2026-09-23-track-rail-motion.md`에 기록했다.
- 2026-09-23 GMS·Home·EMS의 재생 버튼 아이콘을 공통 `PlayIcon` SVG와 `cover-play-button` 스타일로 통일했다. GMS 전용 Gateway 마크업에도 40px 원형·그림자·hover/focus·모바일 표시 규칙을 직접 연결하고, `grid/place-items:center`로 삼각형을 정중앙 배치했으며, 상세 결과는 `docs/changes/2026-09-23-play-icon-unification.md`에 기록했다.
- 2026-09-23 GMS 카드에서 추천 이유 라벨을 제거해 제목·아티스트·앨범·결정 버튼 중심으로 단순화했다.
- 2026-09-23 검색 본문과 추천어 요청을 분리했다. 추천어 API 실패·잘못된 응답·네트워크 오류가 카탈로그 검색 결과를 차단하지 않으며, 상세 결과는 `docs/changes/2026-09-23-search-suggestions-fallback.md`에 기록했다.
- 2026-09-23 검색 내비게이션을 일반 사이드바 메뉴 리듬으로 통합하고 SVG 아이콘·active 상태를 추가했다. 모바일 상단에도 검색 아이콘을 배치했으며, 상세 결과는 `docs/changes/2026-09-23-search-navigation-layout.md`에 기록했다.
- 2026-09-23 실제 운영 `annette` 검색에서 TIDAL v2의 `Include count 12 exceeds limit 10` 오류를 재현했다. `topHits`·`artists.profileArt`를 유지하고 선택적인 `albums.artists`를 제외해 10개로 줄였다. 초기 수정에서 `topHits`를 빼 통합 결과가, 이후 `artists.profileArt`를 빼 아티스트 아트워크가 비는 회귀를 확인·복구했으며, 앨범 아티스트는 트랙 관계 fallback으로 보완하고 카탈로그 실패 시에도 제시어를 표시하도록 했다. 상세 결과는 `docs/changes/2026-09-23-tidal-search-include-limit.md`에 기록했다.
- 2026-09-23 검색 결과와 제시어를 함께 표시한 뒤 2026-09-28 닫기 상호작용을 보완했다. 현재는 결과와 제시어를 유지하고 외부 클릭·`Escape`·결과 탭 선택에서 닫으며, 검색창 재포커스 시 다시 연다. 새 입력은 이전 제시어를 비운다.
- 2026-09-23 전역 하단·전체 화면 플레이어에 현재 트랙 좋아요 버튼을 추가했다. 기존 `trackLikeItem`·`LikeButton`을 재사용해 컴팩트·전체 화면의 상태와 저장 흐름을 공유하며 상세 결과는 `docs/changes/2026-09-23-player-likes.md`에 기록했다.
- 2026-09-23 전체 화면 플레이어의 커버 영역에 현재 트랙 앨범 이미지를 표시하도록 확장했다. 이미지 로드 실패 시 기존 그라데이션 fallback을 유지하며 상세 결과는 `docs/changes/2026-09-23-player-likes.md`에 기록했다.
- 2026-09-23 Home·EMS·GMS 트랙 카드의 재생 오버레이 표시 규칙을 통일했다. 기본 상태에서는 숨기고 artwork hover/focus에서만 표시하며, 터치에서는 표시한다. 전역 hover CSS와 충돌하던 `opacity`·`pointer-events` 조건을 전용 규칙으로 정리하고 345개 테스트·lint·build를 통과한 뒤 Zorin `650cbe9`으로 배포했다. 상세 결과는 `docs/changes/2026-09-23-main-play-overlay.md`에 기록했다.
- 2026-09-23 TIDAL 최고 음질 재생을 우선 시도하고 DASH/DRM처럼 현재 엔진이 재생하지 못하는 응답에만 `HI_RES → LOSSLESS → HIGH → LOW`로 자동 fallback하도록 수정했다. 운영 품질별 응답에서 원인을 확인했고 346개 테스트·lint·build를 통과한 뒤 Zorin `2b81b13`으로 배포했다. 상세 결과는 `docs/changes/2026-09-23-tidal-playback-quality-fallback.md`에 기록했다.
- 2026-09-23 EMS 관리자 페이지 1차를 추가했다. `https://mrms.approid.team/admin`에서 템플릿 기반 Vite UI를 같은 origin으로 제공하고, `ADMIN_AUTH0_SUBJECTS` allowlist를 서버 API에 적용했다. Dashboard·Sections·Tracks·Ingestion 조회와 섹션 메타데이터 PATCH를 제공하며, 수집 재실행·대량 삭제는 제외했다. 상세 결과는 `docs/changes/2026-09-23-ems-admin.md`에 기록했다.
- 2026-09-23 EMS 관리자 페이지 `9df62ca`를 Zorin에 배포했다. `/admin` 공개 HTTP 200, 비로그인 관리자 API 401, Web·PostgreSQL·embedding·tunnel 상태를 확인했다. 운영 `web.env`의 `ADMIN_AUTH0_SUBJECTS`는 아직 비어 있어 Auth0 `sub` 주입과 허용 계정 PATCH 검증이 다음 작업이다.
- 2026-09-24 `b860bff`에서 EMS 수집 시작·일시정지·재개와 활성 트랙·후보 처리 그래프를 관리자 페이지에 추가하고 Zorin에 배포했다. `011_ems_admin_ingestion.sql`을 적용했고 Web·워커는 healthy다. 관리자 허용 목록은 설정돼 있으며 비로그인 작업 API 401을 확인했다. 시작 시 active 2,186곡에서 상한 없는 작업 `555e84ec-a83c-404b-b7aa-bf741b448b12`를 실행했다. 상세는 `docs/changes/2026-09-24-admin-ems-ingestion.md`에 기록했다.
- 2026-09-24 `6a320d5`에서 정기 원천 갱신을 추가했다. TIDAL 에디토리얼은 작업 완료 하루 뒤 재탐색하고 MusicBrainz core·canonical은 각각 12·24시간마다 버전을 확인한다. 관리자 `/admin/ems/routines`에 원천별 상태·버전·다음 확인·조작 메뉴가 있다. `012_ems_source_routines.sql` 적용과 Web·워커·별도 원천 서비스 시작을 완료했다. canonical 첫 확인은 끝났고 새 core 다운로드가 진행 중이다. `25a81f8`에서 관리자 자산 캐시 문제를 수정해 실제 브라우저 메뉴 노출을 확인했다. 상세는 `docs/changes/2026-09-24-recurring-ems-sources.md`에 기록했다.
- 2026-09-24 `3a222b6`에서 관리자 `화면 관리`를 메인과 EMS로 분리했다. 두 화면의 섹션 제목·설명·순서·노출을 독립 설정으로 저장하고 `013_ems_screen_sections.sql`을 적용했다. `b86eda6`은 이전 섹션 주소에서 새 메뉴가 펼쳐지도록 수정했다. 공개 메인·EMS 응답과 브라우저 메뉴, Web 상태를 확인했다. 상세는 `docs/changes/2026-09-24-independent-screen-management.md`에 기록했다.

## 검증 결과

| 날짜 | 작업 디렉터리·명령 또는 수동 절차 | 성공 조건 | 결과 |
|---|---|---|---|
| 2026-09-29 | Zorin 8곡 bounded worker, 실패곡 메모리 pipe 진단, audio-analysis pytest·container build/smoke, 단일 서비스 release와 한 곡 재처리 | 요청·sample 상한, 긴 provider preview 30초 truncate, 모델 계약, 실패·대기 0, 다른 서비스 보존 | 통과: 첫 실행 `7 completed/1 failed`, 원인 60.005초 정상 PREVIEW; 수정 뒤 표본 8/8·전체 9/9 completed, 요청 `17+3`, 30초·16kHz·segment 3·coverage 1.0·2,304차원 L2·prediction 28, audio-analysis 13개·EMS 74개 테스트, release `db8c230`, restart 0·오류 로그 0·public ready 200 |
| 2026-09-29 | `apps/web`·`apps/admin` Vitest, ESLint, production build, 임시 PostgreSQL 통합 테스트, Zorin Web-only release, local/public HTTP와 로그인 관리자 desktop·`390x844`·키보드 QA | 집계·상세·단일 재처리 경계, 민감 데이터 비노출, 인증·반응형·키보드 동작, 기존 서비스 보존 | 통과: Web 120개 파일·463개 테스트와 PostgreSQL 통합 1개(Admin 관련 integration 기본 1개 skip), Admin 5개 파일·12개 테스트, lint 오류 0(기존 경고 Web 5·Admin 38), 두 build, release `e1bbe73`, health 200·비인증 화면 307·API 401·최근 Web 오류 0, 비-Web container ID·시작 시각 불변 |
| 2026-09-28 | `apps/web`: 기능 관련 Vitest, 전체 `npm test`, `npm run lint`, `npm run build`; 저장소 `git diff --check` | MMS 내부 플레이리스트 CRUD와 트랙 추가·제거·재정렬, 사용자 격리·중복·오류 경계 | 통과: 관련 12개 파일·52개 테스트, 전체 116개 파일·450개 테스트, lint 오류 0(기존 경고 5개), Next.js 16.3.5 build·TypeScript, diff check |
| 2026-09-28 | pipeline/Web/admin test·lint·build·audit, Zorin backup·migration·Web/EMS worker release, 관리자 실행, DB/API/browser QA | 4개×50곡, 예산 준수, completed snapshot만 전시, duplicate 0, 기존 EMS·사용자 데이터 보존 | 통과: run `8ca016f7...`, Spotify `4/4`, TIDAL `121/450`, matched/not_found `91/19`, public `46/36/45/38`, active `39,035→39,099`, 사용자 집계 `1,5,0,1` 동일, desktop·`390x844` overflow·console 오류 0. Web 전체 test는 기존 Auth mock 3건 실패 |
| 2026-09-28 | `apps/web` GMS focused·full Vitest, 변경 파일 ESLint, build, production audit, Web-only release, 로그인 GMS desktop·`390x844` browser QA | 트랙 목록형, 전체 추천 queue, `+ MMS`·싫어요 아이콘, mobile overflow·action 잘림 0, EMS 보존 | 통과: focused 10개, build·lint·diff check, production audit 취약점 0, release `8822341`, 운영 12행·12개 축약 액션, 카드·rail·mobile overflow·action 잘림·browser 오류 0. 전체 테스트는 기존 인증 mock 3건 실패 |
| 2026-09-28 | `apps/web` shuffle/EQ focused·full Vitest, 변경 파일 ESLint, build, Web-only release, 로그인 MMS desktop·`390x844` browser QA | 셔플 큐 즉시 재생·다음 곡 순서, 실제 PCM EQ 변화, 겹침·browser 오류 0, EMS 보존 | 통과: focused 4파일·27개, build·lint·diff check, release `d33d8fb`, 31곡 셔플 첫 곡·다음 곡 일치, `pcm` canvas `418x112`와 시간차 변화, desktop/mobile 오류 0. 전체 테스트는 기존 인증 mock 3건 실패 |
| 2026-09-28 | `apps/web` focused/full Vitest·변경 파일 ESLint·build·diff check, Zorin Web-only release, public HTTP·로그인 Search browser QA | 결과와 제시어 동시 표시, 외부 클릭·`Escape` 닫기, 입력창 재진입, 기존 서비스·EMS 보존 | 통과: focused 7개, ESLint 오류·경고 0, build, release `fa3e1ab`, Web healthy, public 5개 경로 HTTP 200, 결과+listbox 1·외부 클릭/`Escape` 뒤 0, EMS ID/image/start 불변. 전체 테스트는 기존 인증 mock 3건 실패, focus 유지 재클릭 browser 자동화 미검증 |
| 2026-09-27 | `apps/web` PCM·DFT·capture·player·visualizer·analysis route focused/full Vitest, lint, build, Web-only release, public desktop browser QA | 실제 신호만 사용, TIDAL 트랙 진입 경계, 48MiB hard cap, 세션·대기열 보존, 오류 경로, 기존 서비스 유지 | 통과: focused 27개·연결 회귀 24개·보완 13개, lint 오류 0, build·diff check, release `58ba65e`, Web healthy, local/public 200, analysis 비인증 401, desktop 대기열·모드·오류 경로와 console 오류 0. 전체 기존 실패 4건, mobile 실제 viewport·로그인 PCM 미검증 |
| 2026-09-27 | 1k 결과·migration·Python worker/source routine·TypeScript 관리자 계약 정적 검토 | 10k 진입/중단 기준과 hard cap, 중복·pause/resume·429·disk·embedding 시나리오, 승인 결정 기록 | 보류: `HOLD_10K`, 1k 종료 `846/36/1,800`, 10k 확대 신규 `9,000/375/18,000`, 외부 실행·DB write·scheduler 변경 0건 |
| 2026-09-27 | pipeline TDD·전체 pytest, bounded resolver·embedding, 격리 PostgreSQL restore, 전수 match audit, 20곡 playback media probe, local/public smoke | 24/50/1 이내, false match 1% 미만, embedding·rollback·보존 통과, run paused | 통과: pipeline 58개·Web focused 32개, 24/24 matched·GET 24, 최종 `154/806/40`, false match 0/154, target embedding 154/154·전체 미완료 0, playback media 20/20, 기존 active 38,861/38,861·사용자 fingerprint 보존 |
| 2026-09-27 | 공개 Home·EMS desktop/`390x844` browser QA, sections API 대조, focused Vitest·lint·build | Home top 3, EMS 5개 section, rail 입력·재생 recovery·검색·빈/오류 문구, count/filter, blocking 결함 0 | 통과: 5개×12곡, `totalCount=38,762`, 중복·문서 overflow·console 오류·blocking 결함 0, focused 26개 테스트, lint 오류 0, build 통과 |
| 2026-09-27 | pipeline TDD·전체 pytest, Web focused/full test·lint·build, Zorin backup·dry-run·actual sync·Web-only release, local/public smoke | 4개 이상 section 각 6~12곡, 중복 0, 상시 worker 불변, health·sections API·Home·EMS 성공 | 통과: pipeline 56개·focused Web 24개, 5개 section×12곡, pair·전역 중복 0, 8개 local/public HTTP 200, worker ID/image/start 불변. Web 전체 test는 기존 불일치 4건 실패 |
| 2026-09-27 | editorial focused pytest·Vitest, Zorin one-off `sync-editorial-sections --dry-run`, DB fingerprint·release·HTTP 대조 | 5 slug 집계, 최소 4개 joined 6 이상, stored 0, 기존 DB·서비스 불변 | 통과: pipeline 12개·Web 24개 테스트, joined `25/38/28/30/26`, stored 모두 0, section 10·membership 113 fingerprint 불변, 세 container healthy, Home·EMS·readiness 200 |
| 2026-09-27 | `services/ems-pipeline` full pytest, one-off resolver image build, 운영 DB 백업·단일 batch·전후 count 대조 | editorial 우선 24건, GET budget 50 이하, run paused, DB·사용자 데이터 보존 | 통과: 52개 테스트, 24/24 matched, GET 24, 후보 합계 1,000·resolving 0·matched_count 130, active EMS 38,582→38,618, 사용자 기준 수치 불변 |
| 2026-09-27 | `apps/web` focused Vitest·lint·build, Zorin Web image build·Compose 교체, 공개 HTTP·브라우저 smoke | 비회원 재생 오류 안내, 로그인 복귀 경로, 내부 코드 비노출, 롤백 보존 | 통과: focused 9개 테스트, lint·build, release `bc47ed34e971`, Web healthy, 공개 `/`·`/ems`·readiness 200, 로그인 307, `returnTo=/ems`, 브라우저·Web 로그 오류 0건 |
| 2026-09-20 | 생성 문서의 경로·링크·템플릿 확인 | `AGENTS.md`가 가리키는 4개 문서와 작업·변경 템플릿이 존재함 | 통과: 7개 필수 문서의 존재, `AGENTS.md` 참조, 템플릿 표식 확인 |
| 2026-09-20 | 수정된 하네스 안내와 작업·변경 템플릿 대조 | 조사 근거·직접 검증·미정 항목을 기록할 수 있음 | 통과: 필수 문서 7개, `AGENTS.md` 참조, 추가 템플릿 항목 확인 |
| 2026-09-21 | `apps/web`: `npm test` | 전체 회귀 통과 | 통과: 43개 파일, 132개 테스트 |
| 2026-09-21 | `apps/web`: `npm run lint` | ESLint 오류 없음 | 통과 |
| 2026-09-21 | `apps/web`: `npm run build` | production build와 TypeScript 통과 | 통과 |
| 2026-09-21 | 공개 도메인 브라우저 확인 | 검색·재생 선택·셔플 상태·현재 대기열 표시 | 통과 |
| 2026-09-21 | 공개 도메인 TIDAL 재생 확인 | 재생 시간 증가와 미디어 오류 없음 | 통과: `paused: false`, `readyState: 4`, `errorCode: null` |
| 2026-09-21 | 공개 도메인 MMS 데스크톱·390×844 모바일 확인 | 빈 상태, 요약, CTA, 모바일 제목과 내비게이션 정상 | 통과 |
| 2026-09-23 | `apps/web`: `npm run test -- --run`, `npm run lint`, `npm run build`, `git diff --check`; 운영 TIDAL 품질별 playbackinfo 확인; 공개 `/`·`/api/health/ready`; Zorin `2b81b13` 컨테이너 health | 최고 음질 우선·재생 가능 품질 fallback과 production 배포 상태 | 통과: 84개 파일·346개 테스트, lint 오류 0개(기존 경고 3개), build 통과, 품질 응답 확인, HTTP 200/ready, 컨테이너 healthy |
| 2026-09-21 | PostgreSQL 확장 migration 적용 전후 확인 | 기존 사용자·연결 보존, 라이브러리 테이블 생성 | 통과: 사용자 1명·연결 1건 유지, 라이브러리 테이블 4개 생성 |
| 2026-09-21 | 공개 도메인 앨범·플레이리스트 상세 확인 | 실제 컬렉션의 전체 트랙과 검색 상태 복원 | 통과: 앨범 13곡, 플레이리스트 25곡, 상대 cursor pagination 확인 |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build`; 저장소: `git diff --check` | TIDAL Embed 폴백 회귀와 production 검증 | 통과: 46개 파일, 147개 테스트, ESLint, build, diff 검사 |
| 2026-09-21 | 저장소: `AGENTS.md` 참조 문서 16개 경로 존재 확인 | 참조 문서가 실제 존재 | 통과: 16/16 |
| 2026-09-21 | 하네스 6절 전역 스킬 58개와 세션 제공 목록 대조 | 이름·분류별 개수 일치 | 통과: 58/58 |
| 2026-09-21 | 실제 TIDAL Device Code 승인과 공개 도메인 재생 | `FULL` manifest 발급, 모달 자동 닫힘, 재생·seek·다음 곡 전환 | 통과: scope `w_usr w_sub r_usr`, playbackinfo HTTP 200, 사용자 동작 확인 |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build`; Impeccable UI 검출 | 최고 음질 기본 요청과 현재 트랙 목록 표시 회귀 | 통과: 50개 파일, 172개 테스트, ESLint, build, UI 지적 0건 |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build`; Impeccable UI 검출 | `STREAM` availability가 없는 트랙의 재생 비활성화와 큐 제외 | 통과: 50개 파일, 176개 테스트, ESLint, build, UI 지적 0건 |
| 2026-09-21 | production 서버 교체 후 로컬·공개 `/search` 확인 | 재생 불가 트랙 비활성화 빌드 반영 | 통과: 양쪽 HTTP 200 |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build`; Impeccable UI 검출 | MMS 플레이리스트 상세와 전용 큐 재생 | 통과: 51개 파일, 181개 테스트, ESLint, build, UI 지적 0건 |
| 2026-09-21 | production 서버 교체 후 로컬·공개 `/mms` 확인 | MMS 플레이리스트 상세 빌드 반영 | 통과: 양쪽 HTTP 200 |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build` | Device Code 승인 완료 후 현재 트랙 자동 재시도 | 통과: 51개 파일, 182개 테스트, ESLint, build |
| 2026-09-21 | production 서버 교체 후 로컬·공개 `/mms` 확인 | 인증 성공 자동 재시도 빌드 반영 | 통과: 양쪽 HTTP 200 |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build`; PostgreSQL migration·스키마 조회 | 네 유형 사용자 좋아요 저장, 가져온 플레이리스트 유지, API/UI 회귀, production build | 통과: 57개 파일, 210개 테스트, ESLint, build, `user_likes` 11개 열·사용자 FK·복합 unique·인덱스 확인 |
| 2026-09-21 | production 서버 교체 후 로컬·공개 `/search`, `/mms`와 비로그인 `/api/likes` 확인 | 사용자 좋아요 build 반영과 인증 경계 | 통과: 화면 4건 HTTP 200, API HTTP 401 `unauthorized` |
| 2026-09-21 | `apps/web`: `npm test`, `npm run lint`, `npm run build`; production 서버 교체 후 로컬·공개 `/mms` 확인 | MMS 최상위 제목 `My Music Space`, 좋아요의 부속 콘텐츠 위계 | 통과: 57개 파일, 210개 테스트, ESLint, build, 양쪽 HTTP 200 |
| 2026-09-22 | `apps/web`: `npm test`, `npm run lint`, `npm run build` | 기능 기준 커밋 `47de7c3` 전체 회귀와 production build | 통과: 57개 파일, 236개 테스트, ESLint, Next.js build·TypeScript |
| 2026-09-22 | Windows 자동화 검증, Zorin Docker build·Compose·DB restore, 공개 HTTP smoke | 전체 DB 보존, Zorin 단독 origin, 기존 서버 격리 | 통과: 61개 파일·242개 테스트, Docker build, DB 10개 table count 일치, local/public health, 공개 화면 HTTP 200, 비로그인 likes 401, Auth0 redirect 307 |
| 2026-09-22 | `apps/web`: 관련 Vitest, `npm test`, `npm run lint`, `npm run build`; Zorin image build·Compose 배포·공개 HTTP smoke | 최초 취향 분석 기준 표시와 고유 트랙 15곡 최소 조건 | 통과: 관련 24개·전체 247개 테스트, ESLint, Next.js build·TypeScript, Web/PostgreSQL health, DB 101곡 유지, 공개 health·onboarding·GMS HTTP 200 |
| 2026-09-22 | 전체 Web·Embedding test, lint, build; 로컬 Compose test/config/build; Zorin rollback dump·pgvector migration·실제 model probe·공개 HTTP smoke | 768차원 임베딩 서비스와 기존 데이터 보존, Web 장애 격리 | 통과: Web 68개 파일·288개 테스트, Embedding 4개 테스트, ESLint·Next.js build, Compose 테스트 3개, image build, dump 검증, pgvector 0.8.6, 기존 101곡 유지, 세 서비스 health, model norm 1.0, 공개 주요 경로 200, 비로그인 분석 401 |
| 2026-09-22 | pipeline 전체 pytest, Web 전체 test·lint·build, diff check, Zorin image build·rollback dump·009 migration·editorial dry-run | 에디토리얼 섹션 구현 회귀와 production data gate | 코드 검증 통과: pipeline 44개, Web 79개 파일·319개 테스트, lint 오류 0, build·diff check. 운영 gate 실패: joined `0/0/3/10/0`, 실제 sync·UI 배포 보류, 기존 Web healthy |
| 2026-09-22 | `services/ems-pipeline`: 임베딩 focused/full pytest, Zorin `music-pie-ems-pipeline:b91afce` 배치, PostgreSQL 상태 조회 | active EMS 임베딩 완료와 원문 비저장 | 통과: pipeline focused 2개·full 47개, `ems_track_embeddings` completed 2,159건, 입력 원문 컬럼 미사용 |
| 2026-09-22 | `apps/web`: GMS 빈 후보 focused test, `npm test`, `npm run lint`, `npm run build` | 프로필 준비·후보 0곡 상태를 프로필 미완료·API 오류와 구분 | 통과: 전체 83개 파일·332개 테스트, lint 오류 0(기존 경고 3), Next.js build·TypeScript |
| 2026-09-22 | `apps/web`: GMS 추천 근거 focused test, `npm test`, `npm run lint`, `npm run build` | 추천 카드에 취향·최근성 근거 표시 | 통과: 전체 83개 파일·333개 테스트, lint 오류 0(기존 경고 3), Next.js build·TypeScript |
| 2026-09-23 | `npm test`, `npm run build`; Zorin Web image build·container health·local/public HTTP smoke | 트랙 카드 레일 모션 변경 배포와 인증 경계 보존 | 통과: 전체 84개 파일·339개 테스트, build, Zorin `music-pie-web-1 healthy`, 공개 `/`·`/ems`·`/gms`·readiness 200, 비로그인 recommendations 401 |
| 2026-09-23 | `apps/web`: 검색 focused Vitest·전체 Vitest·lint·build | 추천어 API 실패가 카탈로그 검색을 차단하지 않음 | 통과: focused 17개·전체 84개 파일 340개 테스트, lint 오류 0(기존 경고 3), build·TypeScript |
| 2026-09-23 | Zorin Web `671bcda` image build·Compose 교체·공개 HTTP smoke | 검색 fallback·include 제한 수정 배포와 Web health | 통과: `music-pie-web-1 healthy`, 공개 `/search`·`/api/health/ready` 200, 비로그인 `/api/tidal/search` 401 |
| 2026-09-23 | `apps/web`: 통합 결과·제시어 회귀 focused/full Vitest·lint·build; 운영 TIDAL `annette` smoke | `topHits` 복구, 검색 실패 시 제시어 보존, include 10개 제한 | 통과: focused 18개·전체 84개 파일 342개 테스트, lint 오류 0(기존 경고 3), build·TIDAL HTTP 200 (`topHits` 100개) |
| 2026-09-23 | `apps/web`: 아티스트 아트워크 회귀 focused/full Vitest·lint·build; 운영 TIDAL `annette askvik` include 비교 | `artists.profileArt` 복구와 플레이리스트·트랙 관계 보존 | 통과: focused 18개·전체 84개 파일 343개 테스트, lint 오류 0(기존 경고 3), build·TIDAL HTTP 200 |
| 2026-09-23 | `apps/web`: 앨범 아티스트 fallback 회귀 test·full Vitest·lint·build | `albums.artists` 생략 시 트랙 아티스트로 앨범 카드 표기 | 통과: focused 8개·전체 84개 파일 343개 테스트 |
| 2026-09-23 | 내비게이션 focused Vitest·전체 Vitest·lint·build·Impeccable detector | 검색 메뉴 위치·형태와 반응형 진입점 | 통과: focused 5개·전체 84개 파일 341개 테스트, lint 오류 0(기존 경고 3), build, findings 0 |
| 2026-09-23 | `apps/web`: 검색 제시어·카탈로그 동시 표시 focused/full Vitest·lint·build | 결과가 있어도 제시어 표시, 새 입력·탭 선택 시 제시어 정리 | 통과: focused 7개·전체 84개 파일 344개 테스트, lint 오류 0(기존 경고 3), Next.js build·TypeScript |
| 2026-09-23 | Zorin Web `5ca1bd9` image build·Compose 교체·공개 HTTP 및 Chrome AX smoke | 제시어·카탈로그 동시 표시 배포와 Web health | 통과: `/search`·`/api/health/ready` 200, `music-pie-web-1 healthy`, `bj` 입력 시 결과와 `검색어 추천` 목록 동시 표시 |
| 2026-09-23 | `apps/web`: 플레이어 좋아요 focused Vitest | 컴팩트·전체 화면 플레이어의 현재 트랙 좋아요 상태 동기화 | 통과: focused 8개 |
| 2026-09-23 | Zorin Web `7aff82d` image build·Compose 교체·공개 HTTP smoke | 플레이어 좋아요 배포와 Web health | 통과: `/search`·`/api/health/ready` 200, `music-pie-web-1 healthy`, current release symlink 확인 |
| 2026-09-23 | `apps/web`: 전체 화면 플레이어 앨범 이미지 focused Vitest | 현재 트랙 artwork 표시와 이미지 실패 fallback | 통과: focused 8개 |
| 2026-09-23 | Zorin Web `b253636` image build·Compose 교체·공개 HTTP smoke | 전체 화면 플레이어 앨범 이미지 배포와 Web health | 통과: `/search`·`/api/health/ready` 200, `music-pie-web-1 healthy`, current release symlink 확인 |
| 2026-09-23 | `apps/web`·`apps/admin`: Vitest, ESLint, Next/Vite build, `git diff --check`; Docker `music-pie-web:ems-admin` build와 image asset 검사 | same-origin `/admin`, EMS 관리자 API 인증·조회·섹션 수정, 기존 사용자 회귀 | 통과: Web 93개 파일·367개 테스트, admin 2개 테스트, web lint 오류 0(기존 경고 3), admin lint 오류 0(템플릿 경고 39), 두 build 통과, Docker image에 `/app/public/admin/assets/index.js|css` 존재. Auth0 미설정 로컬에서 API HTTP 500은 운영 자격 증명 부재로 미검증 |
| 2026-09-23 | `apps/web`: 관리자 셸 루트 ID 회귀 테스트·전체 Vitest·lint·build; Zorin 재배포·Chrome headless smoke | 빈 `/admin` 화면의 `admin_root_missing` 수정 | 통과: Web 93개 파일·370개 테스트, lint 오류 0(기존 경고 3), build, 커밋 `a665f2f`, Web healthy, 공개 `/admin` 200, `MRMS / ADMIN`·`EMS 운영 현황` 렌더링 및 콘솔 오류 미재현 |
| 2026-09-23 | `apps/admin`: 템플릿 레이아웃·전체 라우팅 복원, Vitest·ESLint·Vite build; Zorin Web 강제 재생성·Chrome headless screenshot | 관리자 커스텀 셸을 제거하고 제공 템플릿을 기본 화면으로 사용, EMS는 템플릿 메뉴 아래 유지 | 통과: admin 2개 테스트, build·lint 오류 0, 커밋 `d9d981d`, Web healthy, 다크 템플릿 대시보드·`ALPHA TEAM`·EMS 메뉴 렌더링 확인 |

## 미검증·제약

- 내부 플레이리스트용 `022_mms_playlists.sql`과 Web release는 운영에 반영했다. 로그인된 운영 MMS 렌더링과 생성 폼은 확인했지만 검증용 사용자 데이터를 만들지 않아 실제 생성·편집·삭제·트랙 추가·제거·순서 이동과 모바일 조작은 아직 확인하지 않았다.
- 10k 확대와 scheduler live는 `HOLD_10K`다. 기존 MusicBrainz routine은 이미 additions-only delta를 자동 처리하지만 후보·GET hard cap, 영속 승인, report-only/live 분리, run별 rollback journal이 없어 10k 권한으로 사용할 수 없다. fault injection과 운영 상태 변경은 수행하지 않았다.
- Home top 3·EMS 5개 rail의 desktop/mobile 시각, 키보드, 비회원 재생 recovery와 20곡의 production `FULL` manifest·실제 audio range 수신은 확인했다. 로그인 Chrome 세션을 사용할 수 없어 같은 20곡의 `HTMLAudioElement` decode·재생 위치 증가는 아직 확인하지 않았다. Web 전체 Vitest의 기존 Home copy 기대 1건과 recommendations/likes mock 3건도 별도 정리가 필요하다.
- matched 승격 시 과거 오류 메타데이터를 지우도록 수정했고 target run의 누적 stale 오류 19건도 0으로 정리했다. run은 matched 154, pending 806, retryable 40으로 아직 완료 상태가 아니다.
- 관리자 URL 수집은 코드·로컬 build까지만 확인했다. 운영 migration·배포, Melon/TIDAL live extraction과 로그인 관리자 화면에서의 승인 후 EMS 저장은 미검증이다.
- 사용자 TIDAL 트랙 좋아요와 GMS 추천 수락·거절을 취향 프로필에 반영하는 코드는 로컬 구현 및 Web build/lint까지 확인했다. 운영 배포는 아직 하지 않았다.
- 2026-09-27 로그인된 운영 `/gms`에서 추천 12곡 표시를 확인했다. 액션 저장과 프로필 갱신은 로컬 변경이 미배포 상태이고 실계정 데이터 변경도 하지 않아 아직 미검증이다. 2026-09-23 운영 취향 프로필은 `completed|101`이며 전체 1개·군집 2개 centroid 생성 기록으로 2026-09-22의 `profile_count=0` 메모를 대체한다.
- fixture 기반 EMS 트랙에는 `tidalTrackId`가 없어 실제 스트리밍 대상이 아니다.
- 실제 계정으로 네 유형 좋아요와 MMS 즉시 반영을 확인하는 브라우저 시각 검증은 아직 하지 않았다.
- legacy TIDAL v1 `playbackinfo` 계약이 변경되면 전체 재생 경로를 다시 검증해야 한다.
- `390x844` responsive viewport는 확인했지만 실제 iOS/Android 기기, Safari/Firefox, Bluetooth, codec 지원과 백그라운드 오디오 동작은 아직 검증하지 않았다.
- AI 분석 입력 허용은 테스트 배포까지다. production 배포 범위와 TIDAL 연결 해제 시 데이터 삭제 의무는 아직 확정하지 않았다.
- MusicBrainz 장르 라이선스 확인, 공용 장르 어휘의 콜드스타트 정책, 캐시 만료·갱신 정책은 아직 확정하지 않았다.
- 로그인 계정의 분석 시작 UI는 아직 미검증이다. 운영 `/gms` 카드 표시는 2026-09-27 확인했으나 로컬 액션 프로필 코드가 미배포라 추천 결정 저장 후 프로필 갱신은 확인하지 않았다.
- 기준 기능과 Zorin 배포 기반은 공개 서버에 반영됐다. 로그인된 실제 계정의 MMS 표시와 TIDAL 재생은 브라우저에서 다시 확인해야 한다.
- 2026-09-28 배포 전 운영 연결 메타데이터는 일반 OAuth scope 상태라, 기존에 덮어써진 Device 자격 증명은 사용자 재승인 없이 복구할 수 없다. 새 보존 로직 배포 뒤 전체 재생 연결을 한 번 승인하고 버튼 해제와 실제 재생을 확인해야 한다.
- 로그인된 실제 TIDAL 계정에서 온보딩의 트랙 기준 상태와 15곡 미만 완료 차단은 아직 시각 검증하지 않았다.
- 저장소에는 사용자 작업으로 보이는 미추적 문서 `docs/plans/portable-self-hosted-deployment-guide.md`가 있다. 내용 변경·추적 여부 결정은 다음 작업으로 넘긴다.
- 에디토리얼 section membership과 Web release는 production에 반영됐고 공개 desktop/mobile browser QA를 마쳤다. 로그인 계정의 실제 TIDAL codec 재생은 남아 있다.

## 다음 작업

1. eligible 사용자 트랙에 exact-version audio analysis coverage를 만든 뒤 baseline과 audio hybrid의 순위·점수 분포를 기록하는 shadow ranking pipeline을 구현한다. text profile과 실제 GMS 순서는 activation 승인 전까지 변경하지 않는다.
2. 검증용 데이터 생성·삭제가 허용된 로그인 계정에서 내부 플레이리스트 CRUD와 트랙 추가·제거·순서 이동을 desktop/mobile에서 확인한다.
3. 로그인 브라우저에서 completed taste profile 기반 GMS 추천 카드와 수락·거절 저장을 검증한다.
4. 로그인 TIDAL 계정으로 Home·EMS 실제 codec 재생, player 시간 증가와 `/visualizer` PCM 반응을 확인한다.
5. 로그인 TIDAL 브라우저 세션에서 고정 20곡의 실제 decode·재생 위치 증가를 확인한다.
6. 1,000곡 run의 다음 batch 또는 남은 846건 전체에 대한 aggregate request budget을 별도 승인한 뒤 계속한다.
7. 1,000곡 기준선을 완료·승인한 뒤 10k 선행 구현인 aggregate cap, 승인 전용 resume, report-only/live 분리, 상태·disk·embedding 관측과 rollback journal을 구현·검증한다.

## 관련 문서

- `docs/overview/taste-analysis-system.md`
- `docs/plans/2026-09-29-audio-preview-analysis-implementation.md`
- `docs/changes/2026-09-29-audio-preview-analysis-design-revision.md`
- `docs/changes/2026-09-29-user-audio-taste-profile-shadow.md`
- `docs/plans/2026-09-29-taste-analysis-admin-document.md`
- `docs/changes/2026-09-29-taste-analysis-admin-document.md`
- `docs/harness/portable-project-harness.md`
- `docs/harness/skill-plugin-environment.md`
- `AGENTS.md`
- `docs/project-rules/core-principles.md`
- `docs/project-rules/doc-access-order.md`
- `docs/decisions/2026-09-20-personalized-recommendation-baseline.md`
- `docs/decisions/2026-09-20-admin-template-runtime.md`
- `docs/plans/2026-09-21-shared-track-list.md`
- `docs/changes/2026-09-21-shared-track-list-playback.md`
- `docs/changes/2026-09-21-mms-saved-library.md`
- `docs/changes/2026-09-21-tidal-catalog-details.md`
- `docs/changes/2026-09-21-tidal-supported-playback-fallback.md`
- `docs/plans/2026-09-28-search-suggestion-dismissal.md`
- `docs/changes/2026-09-28-search-suggestion-dismissal.md`
- `docs/plans/2026-09-28-search-suggestion-outside-dismissal.md`
- `docs/changes/2026-09-28-search-suggestion-outside-dismissal.md`
- `docs/plans/2026-09-28-shuffle-equalizer-reimplementation.md`
- `docs/changes/2026-09-28-shuffle-equalizer-reimplementation.md`
- `docs/plans/2026-09-28-gms-entity-layout.md`
- `docs/changes/2026-09-28-gms-entity-layout.md`
- `docs/superpowers/specs/2026-09-28-mms-playlist-management-design.md`
- `docs/plans/2026-09-28-mms-playlist-management.md`
- `docs/changes/2026-09-28-mms-playlist-management.md`
- `docs/deployment/tidal-full-playback-implementation.md`
- `docs/plans/2026-09-28-tidal-playback-session-preservation.md`
- `docs/changes/2026-09-28-tidal-playback-session-preservation.md`
- `docs/changes/2026-09-21-harness-runtime-application.md`
- `docs/changes/2026-09-21-user-likes.md`
- `docs/changes/2026-09-21-tidal-ai-analysis-allowed.md`
- `docs/changes/2026-09-21-musicbrainz-genre-enrichment.md`
- `docs/changes/2026-09-21-genre-embedding-input.md`
- `docs/plans/2026-09-21-genre-embedding-input.md`
- `docs/plans/2026-09-27-editorial-resolver-quality-gate.md`
- `docs/changes/2026-09-27-editorial-resolver-quality-gate.md`
- `docs/plans/2026-09-27-ems-10k-snapshot-diff-gate.md`
- `docs/changes/2026-09-27-ems-10k-snapshot-diff-gate.md`
- `docs/plans/2026-09-27-visual-equalizer.md`
- `docs/changes/2026-09-27-visual-equalizer.md`
- `docs/superpowers/specs/2026-09-22-track-embedding-taste-profile-design.md`
- `docs/superpowers/plans/2026-09-22-track-embedding-taste-profile.md`
- `docs/changes/2026-09-22-track-embedding-taste-profile.md`
- `docs/changes/2026-09-23-player-likes.md`
- `docs/changes/2026-09-22-ems-editorial-sections.md`
