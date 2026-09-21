# 작업 계획

- 요청·문제: `docs/decisions/2026-09-20-personalized-recommendation-baseline.md` 원칙 1의 트랙 임베딩 입력에 장르를 붙인다. `mb_genres`가 빈 배열일 때 `mb_tags` 상위 3개를 쓰기로 했는데, `mb_tags`에는 국가·시대·사건·메타 태그가 섞여 있어 비장르 태그가 임베딩 입력에 들어가는 것을 막아야 한다.
- 조사 근거·관련 경로:
  - `docs/changes/2026-09-21-musicbrainz-genre-enrichment.md` 24행의 다음 작업.
  - `docs/superpowers/specs/2026-09-21-musicbrainz-genre-enrichment-design.md` 99~109행의 임베딩 입력 설계와 153행의 태그 필터링 미정 항목.
  - DB 실제 데이터(`127.0.0.1:55434/music_pie`, `musicbrainz_artists` 64명·`music_tracks` 101곡). `mb_genres`가 비어 있고 `mb_tags`만 있는 트랙 **0건**, 장르가 비어 있는 아티스트 4명은 태그도 빈 배열.
  - 노이즈 패턴: 사건 `2008 universal fire victim`(10명), 국가·언어 `american` `canadian` `english` `spanish` `uk` `liverpool` `reino unido`, 연대·세대 `1960s` `2020s` `late 2000s` `gen z` `millennial`, 직업·편성 `vocalist` `mezzo-soprano` `saxophonist` `boy band`, 큐레이션 메타·데이터 오류 `cotm candidate` `legends` `anthology` `n.` `aln-sh` `vyrzukhisuc-artiest`.
  - `apps/web/src/lib/musicbrainz/client.ts:43` `extractCountedNames`가 MB 응답의 투표수 순서를 보존하고, `apps/web/src/lib/musicbrainz/enrichment.ts:210` `mergeRankedNames`가 공동 아티스트 병합에서 순서를 유지한다. 따라서 배열의 앞쪽이 가장 투표가 많은 장르·태그다.
- 설계·도메인 경계:
  - **화이트리스트 방식을 선택한다.** denylist는 `american`을 `afro-cuban jazz`와 분리할 구조적 규칙이 없고 `vyrzukhisuc-artiest` 같은 무작위 문자열을 예측할 수 없다. 반면 화이트리스트는 장르 어휘에 속하지 않는 비장르 태그를 전부 한 번에 배제한다.
  - **어휘 출처는 공용 캐시 `musicbrainz_artists.genres`의 합집합.** MB 공식 장르 목록을 새로 호출하지 않아 rate limit·의존성이 늘지 않고, 보강이 진행되면 어휘도 자동 확장된다.
  - `mb_genres`가 1개 이상이면 그대로 임베딩 입력에 쓴다. MB 큐레이션 장르는 필터링 대상이 아니다. 어휘 필터는 `mb_genres`가 빈 배열일 때의 `mb_tags` 폴백에만 적용한다.
  - 폴백은 어휘에 속하는 태그만 남기고 투표 순서대로 상위 3개. 0개 남으면 장르 없이 제목·아티스트·앨범만 임베딩한다(설계 108행).
  - 장르명은 번역하지 않고 영어 그대로 쓴다(설계 109행).
  - 공용 카탈로그 메타데이터는 사용자 개인 모델·행동 데이터와 구분한다. 어휘는 사용자를 가리지 않는다.
- 변경 범위:
  - `apps/web/src/lib/db/music-library.ts`: 신규 `getSharedGenreVocabulary`가 `SELECT DISTINCT unnest(genres) FROM musicbrainz_artists`로 공용 장르 어휘를 반환. `getSavedTracks`가 `mb_genres`·`mb_tags`를 노출.
  - `apps/web/src/lib/music/types.ts`: `Track`에 선택 `genres`·`tags`.
  - `apps/web/src/lib/music/recommendations.ts`: 신규 `buildEmbeddingText`.
  - 위 파일의 테스트.
- 제외 범위:
  - 임베딩 모델 통합. `paraphrase-multilingual-mpnet-base-v2` 런타임 의존성이 `apps/web/package.json`에 없다. 입력 구성과 모델 호출은 별도 작업으로 둔다.
  - 사용자 취향 벡터·추천 후보 선택 로직. `getGatewayTracks`는 그대로 둔다.
  - 장르를 UI에 노출하는 작업.
  - MB 공식 장르 목록(`GET /ws/2/genre`) 시드. 어휘의 콜드스타트(장르가 아직 없는 아티스트)는 남는다.
  - `tmp-list-isrcs.mjs`·`tmp-mb-tags.mjs` 스크래치 스크립트 정리.
- 구현 순서:
  1. `music-library.ts`에 `getSharedGenreVocabulary` 추가, `getSavedTracks`에 장르·태그 컬럼 추가.
  2. `types.ts` `Track` 확장.
  3. `recommendations.ts`에 `buildEmbeddingText` 추가.
  4. 테스트 작성(장르 있음·폴백 필터링·전부 빈 경우·제목 등 메타데이터 누락).
  5. `npm test`·`npm run lint`·`npx tsc --noEmit`.
- 완료 기준:
  1. 장르가 있는 트랙은 `mb_genres`가 임베딩 텍스트에 포함된다.
  2. 장르가 비어 있으면 어휘에 속하는 태그만 상위 3개 포함된다.
  3. 국가·시대·사건·메타 태그(`2008 universal fire victim`, `american`, `1960s`, `cotm candidate` 등)는 어휘에 속하지 않아 절대 포함되지 않는다.
  4. 장르·태그가 전부 비어 있으면 제목·아티스트·앨범만 반환한다.
  5. `apps/web`에서 `npm test`·`npm run lint`·`npx tsc --noEmit`이 통과한다.
- 직접 검증:
  - `apps/web`: `npm test src/lib/music src/lib/db`, `npm run lint`, `npx tsc --noEmit -p tsconfig.json`
  - 전체 회귀: `npm test`
- 미정 항목:
  - 임베딩 모델의 런타임 통합 방식과 라이선스. `package.json`에 해당 의존성이 없어 입력 텍스트를 실제 벡터로 만들지 못했다.
  - `mb_tags`의 비장르 태그를 저장은 하되 임베딩 입력에서만 배제하는 현 선택을 유지할지. 저장 자체를 중단하면 어휘 확장 근거가 줄어든다.
  - MusicBrainz 장르의 라이선스(CC0 여부). 이전 설계 문서의 미정 항목 그대로.
  - 어휘의 콜드스타트. 장르가 없는 아티스트의 태그는 어휘 근거가 없어 폴백이 빈 결과로 끝날 수 있다.
