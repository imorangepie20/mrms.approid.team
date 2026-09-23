# 현재 개발 상태

최종 갱신: 2026-09-23

최신 기능 기준 커밋: `6032acf`

최신 Zorin Web 배포 기준 커밋: `6032acf` (EMS embedding image: `b91afce`)

## 이번 목표

사용자가 TIDAL에서 가져온 플레이리스트와 검색·GMS·EMS에서 좋아요한 트랙·플레이리스트·앨범·아티스트를 MMS에서 탐색하고 재생한다.

## 현재 구현

- `apps/web`에 Next.js 기반 사용자 화면, Auth0 인증, TIDAL 검색·플레이리스트·재생 API가 구현되어 있다.
- 검색 결과는 통합 결과, 트랙, 앨범, 플레이리스트, 아티스트 탭으로 구성된다.
- 검색의 앨범·플레이리스트를 선택하면 상세 트랙 목록, 전체 재생, 셔플을 제공하며 뒤로가기로 검색 상태를 복원한다.
- 검색·EMS·MMS 트랙 목록은 공통 `TrackList`를 사용한다.
- 공통 트랙 목록은 재생 중인 트랙의 행·제목·상태 아이콘을 강조하고 일시 정지 중에도 현재 트랙을 유지해 표시한다.
- TIDAL 검색 트랙에 `STREAM` availability가 없으면 목록에서 재생을 비활성화하고 전체 재생·셔플 큐에서도 제외한다.
- 전역 재생 세션은 큐, 이전/다음, 셔플, 전체/한 곡 반복, 볼륨, 음소거, 재생 위치를 관리한다.
- 전체 재생은 별도 TIDAL Device Code 세션으로 `FULL` playback manifest를 발급하고 `HTMLAudioElement`와 `hls.js`로 재생한다.
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

## 검증 결과

| 날짜 | 작업 디렉터리·명령 또는 수동 절차 | 성공 조건 | 결과 |
|---|---|---|---|
| 2026-09-20 | 생성 문서의 경로·링크·템플릿 확인 | `AGENTS.md`가 가리키는 4개 문서와 작업·변경 템플릿이 존재함 | 통과: 7개 필수 문서의 존재, `AGENTS.md` 참조, 템플릿 표식 확인 |
| 2026-09-20 | 수정된 하네스 안내와 작업·변경 템플릿 대조 | 조사 근거·직접 검증·미정 항목을 기록할 수 있음 | 통과: 필수 문서 7개, `AGENTS.md` 참조, 추가 템플릿 항목 확인 |
| 2026-09-21 | `apps/web`: `npm test` | 전체 회귀 통과 | 통과: 43개 파일, 132개 테스트 |
| 2026-09-21 | `apps/web`: `npm run lint` | ESLint 오류 없음 | 통과 |
| 2026-09-21 | `apps/web`: `npm run build` | production build와 TypeScript 통과 | 통과 |
| 2026-09-21 | 공개 도메인 브라우저 확인 | 검색·재생 선택·셔플 상태·현재 대기열 표시 | 통과 |
| 2026-09-21 | 공개 도메인 TIDAL 재생 확인 | 재생 시간 증가와 미디어 오류 없음 | 통과: `paused: false`, `readyState: 4`, `errorCode: null` |
| 2026-09-21 | 공개 도메인 MMS 데스크톱·390×844 모바일 확인 | 빈 상태, 요약, CTA, 모바일 제목과 내비게이션 정상 | 통과 |
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
| 2026-09-23 | Zorin Web `6032acf` image build·Compose 교체·공개 HTTP smoke | 검색 fallback 배포와 Web health | 통과: `music-pie-web-1 healthy`, 공개 `/search`·`/api/health/ready` 200, 비로그인 `/api/tidal/search` 401 |

## 미검증·제약

- fixture 기반 EMS 트랙에는 `tidalTrackId`가 없어 실제 스트리밍 대상이 아니다.
- 실제 계정으로 네 유형 좋아요와 MMS 즉시 반영을 확인하는 브라우저 시각 검증은 아직 하지 않았다.
- legacy TIDAL v1 `playbackinfo` 계약이 변경되면 전체 재생 경로를 다시 검증해야 한다.
- 실제 모바일 기기의 codec 지원과 백그라운드 오디오 동작은 아직 검증하지 않았다.
- AI 분석 입력 허용은 테스트 배포까지다. production 배포 범위와 TIDAL 연결 해제 시 데이터 삭제 의무는 아직 확정하지 않았다.
- MusicBrainz 장르 라이선스 확인, 공용 장르 어휘의 콜드스타트 정책, 캐시 만료·갱신 정책은 아직 확정하지 않았다.
- 로그인된 실제 계정의 분석 시작 UI와 GMS 카드 시각 검증은 Chrome 연결 도구가 반복 timeout되어 확인하지 못했다. DB 기준 임베딩·취향 프로필은 완료됐으며 다음에는 브라우저에서 GMS 카드와 추천 결정 저장만 확인한다.
- 기준 기능과 Zorin 배포 기반은 공개 서버에 반영됐다. 로그인된 실제 계정의 MMS 표시와 TIDAL 재생은 브라우저에서 다시 확인해야 한다.
- 로그인된 실제 TIDAL 계정에서 온보딩의 트랙 기준 상태와 15곡 미만 완료 차단은 아직 시각 검증하지 않았다.
- 저장소에는 사용자 작업으로 보이는 미추적 문서 `docs/plans/portable-self-hosted-deployment-guide.md`가 있다. 내용 변경·추적 여부 결정은 다음 작업으로 넘긴다.
- 에디토리얼 section membership은 gate 통과 후 production DB에 반영됐지만, Web release symlink는 전환하지 않았다. 로그인 계정의 taste profile과 desktop/mobile 브라우저 QA는 아직 남아 있다.

## 다음 작업

1. 로그인 브라우저에서 completed taste profile 기반 GMS 추천 카드와 수락·거절 저장을 검증한다.
2. Home top 3, EMS section·검색·재생을 desktop/mobile browser에서 확인한다.
3. paused resolver bounded batch와 embedding completion을 계속 확인한 뒤 false-match 검토·rollback rehearsal을 수행한다.
4. 1,000곡 기준선을 승인한 뒤 10,000곡 gate와 snapshot diff scheduler를 검토한다.

## 관련 문서

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
- `docs/deployment/tidal-full-playback-implementation.md`
- `docs/changes/2026-09-21-harness-runtime-application.md`
- `docs/changes/2026-09-21-user-likes.md`
- `docs/changes/2026-09-21-tidal-ai-analysis-allowed.md`
- `docs/changes/2026-09-21-musicbrainz-genre-enrichment.md`
- `docs/changes/2026-09-21-genre-embedding-input.md`
- `docs/plans/2026-09-21-genre-embedding-input.md`
- `docs/superpowers/specs/2026-09-22-track-embedding-taste-profile-design.md`
- `docs/superpowers/plans/2026-09-22-track-embedding-taste-profile.md`
- `docs/changes/2026-09-22-track-embedding-taste-profile.md`
- `docs/changes/2026-09-22-ems-editorial-sections.md`
