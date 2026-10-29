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
- 오프라인 평가: `apps/web/src/lib/db/attribute-ranking.eval.test.ts`. `ATTRIBUTE_RANKING_EVAL_DATABASE_URL`이 있을 때만 실행하며 `BEGIN READ ONLY` 트랜잭션에서 baseline과 baseline-v2 각 24곡의 언어·장르 분포와 탐색 곡을 `console.table`로 출력하고 마지막에 ROLLBACK한다. 단언은 (1) v2 일반 22곡에 트로트 버킷이 없다, (2) v2 일반 곡의 언어 분포와 MMS 분포의 총변동거리가 baseline보다 작다.

## 검증

실제로 실행해 통과한 명령만 적는다.

- `cd apps/web && npx vitest run src/lib/db/attribute-ranking.eval.test.ts`: 환경변수가 없어 1 skipped(의도된 동작)
- `cd apps/web && npm test`: 148 파일 통과·6 skipped, 648 테스트 통과·11 skipped
- `cd apps/web && npm run lint`: error 0, warning 8(기존 warning 수준)
- `cd apps/web && npx tsc --noEmit`: 오류 없음
- `cd apps/web && npm run build`: 통과
- `cd services/ems-pipeline && python -m pytest -q`: 177 passed

## 미검증

- 운영 migration 035 적용, 운영 수집(`collect-musicbrainz-attributes`·`fetch-lastfm-artist-tags`·`resolve-music-attributes`) 실행
- 속성 커버리지 수치(활성 EMS와 사용자 MMS의 `language <> 'unknown'`, `genre_buckets <> '{}'` 비율)와 MMS 언어 판별 표본이 `minimumSample` 20을 넘는지
- 실제 사용자 데이터로 오프라인 평가 실행(`attribute-ranking.eval.test.ts`가 PASS하는지, `ATTRIBUTE_RANKING` 상수 조정 필요 여부)
- `*.postgres.test.ts`의 격리 DB SQL 실행(환경변수 없이 skipped)
- 375px 폭 시각 확인, 탐색 배지의 스크린 리더 낭독

## 배포 순서 메모

1. migration 035를 Web보다 먼저 적용한다. 후보 SQL이 `ems_track_attributes`를 LEFT JOIN하므로 테이블이 없으면 추천 조회가 실패한다.
2. `LASTFM_API_KEY`는 서버의 기존 `shared/secrets/ems.env`에 넣는다. compose가 ems-pipeline과 source-routines에 이미 로드한다. 저장소에는 넣지 않는다.
3. ems-pipeline·source-routines 이미지를 갱신하고 속성 수집을 돌려 커버리지를 측정한다. disk gate는 `music_attributes`·`musicbrainz_metadata`가 12 GiB를 예약한다.
4. 오프라인 평가가 통과한 뒤에만 `GMS_RANKING_VERSION=baseline-v2`로 서빙을 전환한다. 문제가 생기면 값을 되돌려 `baseline`으로 복귀한다.

## 다음 작업

사용자가 요청하면 다음을 순서대로 진행한다.

1. 운영에 migration 035 적용과 이미지 배포, 속성 수집(`fetch-lastfm-artist-tags --limit 500` 샘플부터), 커버리지 측정 및 기록
2. SSH 터널로 읽기 전용 오프라인 평가 실행(`docs/runbooks/ems-catalog-ingestion.md`의 환경변수 참고). 실패하면 `ATTRIBUTE_RANKING` 상수와 `attribute-affinity.test.ts` 기대값을 함께 조정
3. 통과 시 `GMS_RANKING_VERSION=baseline-v2` 전환, 375px·스크린 리더 확인
