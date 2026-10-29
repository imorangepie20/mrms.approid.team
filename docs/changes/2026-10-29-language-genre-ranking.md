# GMS 추천 언어·장르 반영 (baseline-v2)

## 이유

사용자가 "내 플레이리스트는 주로 영어인데 다른 언어가 너무 많이 추천되고, 트로트는 한 곡도 없는데 추천된다"고 보고했다. 2026-10-29 운영 DB 읽기 전용 조회(스펙 `docs/superpowers/specs/2026-10-29-language-genre-ranking-design.md` 1절)로 확인한 근거는 다음과 같다.

- MMS 464곡은 재즈 중심이고 문자 기준 라틴 425·한글 36·한자 3곡이다. 최근 노출 40곡에는 폴란드어·포르투갈어·독일어·프랑스어·스페인어·터키어·중국어·트로트가 섞여 있고 재즈는 거의 없다.
- 멜론 출처 EMS 곡의 트로트 비율은 11%인데 이 사용자에게 노출된 멜론 출처 16곡 중 9곡이 트로트였다. 9/29 이후 노출 180곡은 모두 `baseline`이다.
- 원인은 (1) 다국어 텍스트 임베딩이 언어가 달라도 제목 의미가 같으면 가깝게 놓는 점, (2) 점수식과 후보 필터에 언어·장르 항목이 없는 점, (3) 언어·장르 메타데이터가 거의 비어 있는 점이다(활성 EMS 167,709곡 중 `mb_tags` 보유 15%).

## 변경

계획: `docs/superpowers/plans/2026-10-29-language-genre-ranking.md`. 구현 완료·운영 미배포.

- 파이프라인(`services/ems-pipeline`)
  - `genre_taxonomy.py`: 장르 버킷 분류와 언어 휴리스틱. 국적·서술 태그는 장르 버킷에서 제외한다.
  - `music_attributes_mb.py`, `musicbrainz_match.py`, `musicbrainz_tags.py`: MusicBrainz 덤프에서 언어·태그 사실 수집(`collect-musicbrainz-attributes`).
  - `lastfm.py`: Last.fm 아티스트 top tag 수집(`fetch-lastfm-artist-tags`, `LASTFM_API_KEY` 필요).
  - `music_attributes.py`: 근거를 합쳐 트랙별 언어·장르 버킷을 확정(`resolve-music-attributes [--all]`). 배치 단위로 커밋하고 사용자 트랙을 pending으로 센다.
  - `source_routines.py`, `cli.py`: 루틴 `lastfm_artist_tags`(매시간)·`music_attributes`(6시간)와 CLI 명령. `music_attributes`·`musicbrainz_metadata` disk gate 예약량은 12 GiB.
- DB: `apps/web/src/lib/db/migrations/035_music_attributes.sql`(+`.down.sql`)이 속성 테이블(`ems_track_attributes` 등), `ems_source_routines` 원천 키, `baseline-v2` ranking_version CHECK를 추가한다.
- Web
  - `src/lib/recommendations/attribute-affinity.ts`: 사용자 언어·장르 분포(`ATTRIBUTE_RANKING` 상수), 적합도 배수, 탐색 자리(2곡) 배치.
  - `src/lib/db/user-attribute-distribution.ts`, `gms-recommendations.ts`: 후보 SQL이 `ems_track_attributes`를 LEFT JOIN하고 `attributeRecommendations`(baseline-v2)를 함께 준비한다. 표본이 `minimumSample` 20 미만이면 v2를 만들지 않는다.
  - `src/lib/recommendations/serving.ts`: `GMS_RANKING_VERSION=baseline-v2` 서빙 선택. 기본값은 기존 동작을 유지한다.
  - 배치 크기 12 → 24(`batch-size.ts`, `gms-recommendation-batches.ts`), MMS 이중 집계 방지.
  - UI: 탐색 곡에 배지 표시(`recommendation-history-list.tsx`, `dashboard.css`)와 Last.fm 출처 표기.
- 브랜치 최종 리뷰 수정(2026-10-29)
  - 관리자 `정기 수집`: `lastfm_artist_tags`·`music_attributes` 한국어 라벨과 알 수 없는 키의 원문 fallback을 추가해 화면이 깨지지 않게 했다. 활성·중지·`지금 확인` 허용 목록은 `EMS_SOURCE_ROUTINE_KEYS` 하나로 묶었고 PATCH route에 빠져 있던 `melon_genres`도 함께 허용된다. `apps/web/public/admin` 빌드 산출물을 갱신했다.
  - Last.fm 회로 차단: 연속 `failed` 10회 또는 20분 예산에서 중단하고, 오류 10·26은 즉시 중단해 루틴에 `lastfm_key_invalid`(연속 실패는 `lastfm_unavailable`)를 기록한다. 429는 `Retry-After`(최대 120초)를 따르고 오류 11·16도 29처럼 재시도한다. 반환값에 `stopped_reason`이 추가됐다.
  - 언어 coverage gate: 사용자 언어 점유율 분모를 zxx를 뺀 모든 양의 가중치 항목으로 바꾸고 `unknown`을 자기 키로 둔다. `languageCoverage`(확인 언어 ÷ zxx 제외 항목)와 `languageSources`(`language_source`별 개수)를 `attributeProfile`에 기록하고, coverage가 `languageMinCoverage` 0.3 미만이면 언어 차원을 끈다. 언어·장르가 모두 꺼지면 v2를 만들지 않는다.
  - `music_attributes` 루틴은 core 버전이 이전 `last_version`과 다를 때만 전체 재계산하고, 같으면 stale 행만 계산한다. 수집이 덮어쓴 트랙 속성 행은 `resolved_at = NULL`로 표시해 stale 계산에 잡히게 했다.
  - 탐색 자리 중복: `mismatchKey`가 달라도 후보 언어나 대표 장르 버킷이 같으면 두 자리를 함께 차지하지 않는다(spec 4.3).
  - shadow run의 `served_baseline_track_ids`는 027에서 정한 대로 실제 baseline 응답을 기록하는 의미를 유지한다. v2·hybrid가 제공돼도 바꾸지 않으며, 실제 제공 목록은 `user_recommendation_batches.track_ids`와 `user_recommendation_exposures.ranking_version`에서 확인한다.
  - 오프라인 평가에 MMS 제목·아티스트의 문자 체계(한글·가나·한자·키릴·라틴) 독립 집계와 `v2General.length > 0` 단언을 추가했다. TVD 비교는 MMS 분포에서 unknown을 뺀 확인 언어만 다시 정규화해 쓴다.
  - 런북에 Last.fm 회로 차단 동작과 Last.fm 데이터 삭제 절차를 추가했다.
- 오프라인 평가: `apps/web/src/lib/db/attribute-ranking.eval.test.ts`. `ATTRIBUTE_RANKING_EVAL_DATABASE_URL`이 있을 때만 실행하며 `BEGIN READ ONLY` 트랜잭션에서 baseline과 baseline-v2 각 24곡의 언어·장르 분포와 탐색 곡을 `console.table`로 출력하고 마지막에 ROLLBACK한다. 단언은 (1) v2 일반 22곡에 트로트 버킷이 없다, (2) v2 일반 곡의 언어 분포와 MMS 분포의 총변동거리가 baseline보다 작다.

## 검증

실제로 실행해 통과한 명령만 적는다.

- `cd apps/web && npx vitest run src/lib/db/attribute-ranking.eval.test.ts`: 환경변수가 없어 1 skipped(의도된 동작)
최종 리뷰 수정 후(2026-10-29) 다시 실행한 결과:

- `cd apps/web && npm test`: 150 파일 통과·6 skipped, 667 테스트 통과·11 skipped
- `cd apps/web && npm run lint`: error 0, warning 8(기존 warning 수준)
- `cd apps/web && npx tsc --noEmit`: 오류 없음
- `cd apps/web && npm run build`: 통과
- `cd apps/admin && npm test`: 6 파일, 16 테스트 통과
- `cd apps/admin && npm run build`: 통과(chunk 크기 경고만 있음)
- `cd services/ems-pipeline && python -m pytest -q`: 195 passed

## 운영 배포(2026-10-29)

사용자 `1 하고 커밋 푸시 배포해` 요청에 따라 `feat/language-genre-ranking`을 `main`에 병합(`c7214f1`)·push하고 Zorin에 배포했다. 서빙 랭킹 전환(`GMS_RANKING_VERSION`)은 하지 않았다.

- source: `git archive c7214f1`, 7,157,760bytes, SHA-256 `1063020c836f071be90118420ef0724ce5a654c9cf795a87b79277b4145357da`
- release `/home/approid/apps/music-pie/releases/20261029-lang-genre-c7214f1`, image `music-pie-web:lang-genre-c7214f1`·`music-pie-ems-pipeline:lang-genre-c7214f1`(revision·source-sha256 label 일치). ems-pipeline image에서 새 모듈 import 확인
- DB 백업: `shared/backups/20261029-lang-genre-c7214f1-before-035.dump`, 772,176,537bytes, SHA-256 `eec047d04e7a6a1d4e38fb499fa3003800828cf06ddee28377f61a07b9e8319f`, `pg_restore --list` 통과, 권한 600. 적용 전 migration 34개
- migration: compose `migrate`(새 Web image)로 `1 pending migrations applied`, 적용 후 35개. 새 테이블 `ems_track_attributes` 0행
- 새 루틴 `lastfm_artist_tags`·`music_attributes`는 첫 수집의 메모리·디스크·시간을 수동으로 관찰하기 위해 `enabled=false`로 바꿨다. 관리자 `정기 수집`에서 켤 수 있다
- override `shared/compose.lang-genre.yml`(web·migrate·ems-pipeline·ems-source-routines image)을 `compose.zorin.yml`·`compose.musicbrainz-ssd.yml`·`compose.kpop-sections.yml` 뒤에 붙여 `up -d --no-deps --no-build --force-recreate --pull never web ems-pipeline ems-source-routines`
- 결과: web·ems-pipeline healthy, 세 container restart 0, source-routines running. 내부 `/`·`/ems`·`/gms` 200, `/admin` 307 → 로그인, 없는 경로 404, readiness 200. Web image에 관리자 bundle의 `lastfm_artist_tags`, `.next/static`의 `gms-attribution` 포함. source-routines container에 `LASTFM_API_KEY` 값 존재(값은 확인하지 않음). 최근 5분 Web 로그 error 0. 나머지 4개 container(postgres·embedding·audio-analysis·tunnel) ID 전후 동일. 공개 `https://mrms.approid.team`의 `/`·`/gms` 200, `/admin` 307, readiness 200
- rollback: 이전 image를 `music-pie-rollback:{web,ems-pipeline,ems-source-routines}-pre-lang-genre-20261029`로 tag했다(web `gms-mms-progress-fdcaa16`, ems-pipeline `kpop-sections-6b19816`, source-routines `ssd-storage-20261009`). 035는 추가 테이블·CHECK 확장이라 rollback 시 자동 down하지 않는다
- 서버 증거: `shared/artifacts/20261029-lang-genre-c7214f1/`(build/backup/migrate/deploy/verify scripts, build·migrate log, `rollback-images.txt`, `others-before/after.txt`, `verification.txt`)

## 첫 운영 수집(2026-10-29)

사용자 요청으로 첫 수집을 별도 container(루틴과 같은 `--memory 2g --cpus 1.0`)에서 관찰하며 실행했다. 같은 `selected` 디렉터리 추출 충돌을 피하려고 그동안 `musicbrainz_metadata` 루틴을 끄고, 끝난 뒤 다시 켰다.

- 스냅샷 `20261028-002228`. 소요 시간: core 추출 1,220초, MB 수집 470초, 전체 resolve 78초. 2분 간격 측정의 최대 메모리 1.107GiB, OOM 없음, exit 0. `selected` 5.1G → 15G
- MB 수집: scanned 170,133, matched_recordings 152,958, with_language 135,656, with_tags 60,931, artists 32,617
- 활성 EMS 언어 출처: `musicbrainz_release` 79.9%, `musicbrainz_artist` 12.3%, `script` 1.6%, `none` 6.2%. 장르 출처: `musicbrainz_recording` 33.3%, `artist` 23.8%, `melon` 3.6%, `none` 39.3%. 언어 상위 eng 117,320·fra 9,352·deu 7,012·jpn 4,550·spa 3,614·kor 2,856·por 2,505
- 선택 플레이리스트 MMS 언어 판별률(zxx 제외): `8534d93b` 0.685(318/464), `fb45ff56` 0.584, `6498b7b2` 0.592. 모두 `languageMinCoverage` 0.3 이상이다. `8534d93b`는 eng 260·kor 34(script 31)·unknown 146, 장르 판별 267곡(jazz 115·pop 46.6·rock 19.1)
- Last.fm 샘플 500명: ok 415·not_found 85·failed 0, 502초, 회로 차단 없음. 500명 기준 `lastfm_tags` 183kB(전체 약 32,600명이면 약 12MB로 추정, 100MB 상한 이내). 이후 stale resolve 752행
- 새 루틴 2개는 아직 `enabled=false`다. 루틴 enable SQL은 자동 권한 판단에서 막혀 사용자가 관리자 `정기 수집`에서 켜기로 했다

## 미검증

- 새 루틴(`lastfm_artist_tags`·`music_attributes`)의 정기 실행. 아직 꺼져 있다
- 실제 사용자 데이터로 오프라인 평가 실행(`attribute-ranking.eval.test.ts`가 PASS하는지, `ATTRIBUTE_RANKING` 상수 조정 필요 여부)
- `*.postgres.test.ts`의 격리 DB SQL 실행(환경변수 없이 skipped)
- 375px 폭 시각 확인, 탐색 배지의 스크린 리더 낭독
- 관리자 `정기 수집` 화면의 실제 브라우저 확인(새 카드는 서버 렌더 단위 테스트로만 확인)
- 실제 Last.fm API에 대한 회로 차단·`Retry-After` 동작(가짜 transport와 가짜 시계로만 확인)
- 런북의 Last.fm 데이터 삭제 SQL·`resolve-music-attributes --all` 실제 실행

## 배포 순서 메모

1. migration 035를 Web보다 먼저 적용한다. 후보 SQL이 `ems_track_attributes`를 LEFT JOIN하므로 테이블이 없으면 추천 조회가 실패한다.
2. `LASTFM_API_KEY`는 서버의 기존 `shared/secrets/ems.env`에 넣는다. compose가 ems-pipeline과 source-routines에 이미 로드한다. 저장소에는 넣지 않는다.
3. ems-pipeline·source-routines 이미지를 갱신하고 속성 수집을 돌려 커버리지를 측정한다. disk gate는 `music_attributes`·`musicbrainz_metadata`가 12 GiB를 예약한다.
4. 오프라인 평가가 통과한 뒤에만 `GMS_RANKING_VERSION=baseline-v2`로 서빙을 전환한다. 문제가 생기면 값을 되돌려 `baseline`으로 복귀한다.

## 탐색 자리 중복 판정 수정(2026-10-29)

최종 재검토 잔여 지적: `explorationKeys`가 사용자에게 익숙한 언어·장르까지 중복 판정 키로 써서, 예를 들어 영어 트로트와 영어 메탈 두 탐색 후보가 `lang:eng`로 겹쳐 탐색 곡이 1곡만 채워졌다.

- `apps/web/src/lib/recommendations/attribute-affinity.ts`: `AttributeFit.language`는 언어가 맞지 않을 때만, `dominantGenre`는 후보의 대표 장르 점유율이 `genreFullShare` 미만일 때만 채운다. 같은 낯선 언어·장르가 두 자리를 차지하지 않는 규칙(spec 4.3)은 유지한다
- 테스트 2개 추가(같은 사용자 언어의 두 장르 탐색, 같은 익숙한 장르의 두 언어 탐색): 변경 전 2개 실패, 변경 후 `attribute-affinity.test.ts` 21개 통과. 기존 한국어 트로트·영어 트로트 중복 테스트도 통과
- 전체 `npm test` 669 통과·11 skipped, `npx tsc --noEmit` 통과, `npm run lint` error 0(기존 warning 8), `npm run build` 통과

## 다음 작업

사용자가 요청하면 다음을 순서대로 진행한다.

1. (배포·첫 수집·Last.fm 샘플은 2026-10-29 완료) 관리자 `정기 수집`에서 `lastfm_artist_tags`·`music_attributes` enable
2. (완료, 아래 `탐색 자리 중복 판정 수정` 참조) 탐색 자리 중복 제거 수정. 운영 Web 반영은 서빙 전환과 함께 한다
3. SSH 터널로 읽기 전용 오프라인 평가 실행(`docs/runbooks/ems-catalog-ingestion.md`의 환경변수 참고). 실패하면 `ATTRIBUTE_RANKING` 상수와 `attribute-affinity.test.ts` 기대값을 함께 조정
4. 통과 시 `GMS_RANKING_VERSION=baseline-v2` 전환, 375px·스크린 리더 확인
