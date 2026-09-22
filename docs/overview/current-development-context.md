# 현재 개발 상태

최종 갱신: 2026-09-22

최신 기능 기준 커밋: `dae510c`

최신 Zorin 배포 기준 커밋: `dae510c`

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
- 실제 임베딩 모델 호출과 사용자 취향 벡터 구성은 아직 구현하지 않았다. 현재 구현은 임베딩 입력 텍스트 생성까지다.
- TIDAL 온보딩은 선택한 플레이리스트의 예상 트랙 수와 `15곡 최소`·`30곡 권장`·`60곡 다중 취향` 기준을 표시한다. 가져오기 후 사용자별 고유 트랙이 15곡 미만이면 첫 추천 준비를 완료하지 않는다.
- 공개 주소는 `https://mrms.approid.team/`다. production은 Zorin OS의 Docker Compose에서 실행되며 Web loopback port는 `3104`다. Windows의 기존 `44119` Web과 tunnel connector는 중지했고 PostgreSQL 원본 volume은 rollback용으로 유지했다.
- 초기 개인화 추천 전략과 사용자별 영구 제외 규칙은 기존 결정 문서를 따른다.
- 2026-09-21 사용자가 TIDAL Developer Terms의 AI 서비스 제한 제약을 해소했다. 테스트 배포까지 가져온 TIDAL 트랙 메타데이터를 취향 분석 임베딩 입력으로 사용할 수 있다. 근거는 `docs/changes/2026-09-21-tidal-ai-analysis-allowed.md`에 있다.

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

## 미검증·제약

- fixture 기반 EMS 트랙에는 `tidalTrackId`가 없어 실제 스트리밍 대상이 아니다.
- 실제 계정으로 네 유형 좋아요와 MMS 즉시 반영을 확인하는 브라우저 시각 검증은 아직 하지 않았다.
- legacy TIDAL v1 `playbackinfo` 계약이 변경되면 전체 재생 경로를 다시 검증해야 한다.
- 실제 모바일 기기의 codec 지원과 백그라운드 오디오 동작은 아직 검증하지 않았다.
- AI 분석 입력 허용은 테스트 배포까지다. production 배포 범위와 TIDAL 연결 해제 시 데이터 삭제 의무는 아직 확정하지 않았다.
- MusicBrainz 장르 라이선스 확인, 공용 장르 어휘의 콜드스타트 정책, 캐시 만료·갱신 정책은 아직 확정하지 않았다.
- `paraphrase-multilingual-mpnet-base-v2` 런타임 의존성과 실제 임베딩 저장·갱신 경로는 아직 없다.
- 기준 기능과 Zorin 배포 기반은 공개 서버에 반영됐다. 로그인된 실제 계정의 MMS 표시와 TIDAL 재생은 브라우저에서 다시 확인해야 한다.
- 로그인된 실제 TIDAL 계정에서 온보딩의 트랙 기준 상태와 15곡 미만 완료 차단은 아직 시각 검증하지 않았다.
- 저장소에는 사용자 작업으로 보이는 미추적 문서 `docs/plans/portable-self-hosted-deployment-guide.md`가 있다. 내용 변경·추적 여부 결정은 다음 작업으로 넘긴다.

## 다음 작업

1. 임베딩 모델 런타임과 벡터 저장·갱신 방식을 설계한 뒤 `buildEmbeddingText` 출력으로 트랙 벡터를 생성한다.
2. 사용자 취향 벡터 구성과 GMS 추천 후보 점수화에 트랙 임베딩을 연결한다.
3. 로그인된 공개 브라우저에서 검색·EMS·GMS의 네 유형 좋아요와 MMS 반영을 확인한다.
4. 실제 모바일 기기에서 TIDAL 오디오 출력과 백그라운드 재생을 확인한다.

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
