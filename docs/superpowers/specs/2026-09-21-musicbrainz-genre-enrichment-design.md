# MusicBrainz 장르 보강 설계

**날짜:** 2026-09-21

## 목적

TIDAL 오픈 API로 장르를 받을 수 없는 것이 확인되었다. `docs/decisions/2026-09-20-personalized-recommendation-baseline.md`의 임베딩 입력 가운데 장르만 빈 상태다. MusicBrainz 보강 파이프라인에서 장르를 확보해 개인화 추천의 입력으로 쓴다.

## 조사 근거

### TIDAL은 장르를 주지 않는다

- TIDAL OpenAPI(`https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json`)에 `Genres` 리소스와 `/tracks/{id}/relationships/genres`, `/albums/{id}/relationships/genres`, `/genres`, `/genres/{id}` 엔드포인트가 존재한다.
- 이 엔드포인트 전부 `x-path-item-properties.required-access-tier`이 `INTERNAL`이다. 이 프로젝트가 쓰는 `/tracks/{id}`, `/searchResults`, `/playlists`, `/artists/{id}`는 `THIRD_PARTY`다.
- 전체 GET 엔드포인트 251개 중 `INTERNAL` 165개, `THIRD_PARTY` 85개, `PARTNER` 1개. 장르 관련 엔드포인트 중 `THIRD_PARTY`인 것은 0개다.
- 실제 호출로 확인: 저장된 사용자 토큰(scope `user.read search.read playlists.read playback`, `tidal_user_id=203383317`)으로 장르 관계 엔드포인트를 호출하면 HTTP 200에 `data: []`가 돌아온다. 14개 검색어의 상위 트랙 280개·앨범 280개 중 장르가 있는 것은 0건. `countryCode=US`, `KR` 모두 동일.
- 스펙은 "권한이 없는 필드는 에러 대신 응답에서 누락시킨다"고 명시하므로 403이 아니라 빈 배열이 돌아온 것이다.
- client-credentials 토큰 발급은 `400 invalid_grant`로 실패해 다른 자격으로도 시도할 수 없었다.
- 결론: scope 추가나 토큰 재발급으로는 안 풀린다. TIDAL이 third-party에 장르를 열려야 한다.

### MusicBrainz는 아티스트 리소스에서 장르를 준다

- `GET /ws/2/isrc/{isrc}?inc=artist-credits+releases&fmt=json`는 recording 목록을 주고, 각 recording의 `artist-credit[].artist.id`에 아티스트 MBID가 있다.
- isrc 리소스에서 `genres`와 `release-groups`는 **유효하지 않은 inc 파라미터**다. 둘 다 `400 genres is not a valid inc parameter for the isrc resource.` / `release-groups is not a valid inc parameter for the isrc resource.`.
- isrc 응답의 recording에는 `releases` 키가 없다. release 정보가 필요하면 recording 리소스를 따로 조회해야 한다.
- `GET /ws/2/artist/{mbid}?inc=genres+tags&fmt=json`는 `genres`와 `tags` 배열을 준다. 예: Oscar Peterson `ed801bdd-f057-41c0-94fb-76cb5676cd59` → genres `jazz:9, bebop:2, cool jazz:2, hard bop:1, vocal jazz:1`, tags `jazz, piano jazz, canadian, standards, ...`.
- recording 리소스의 `genres`/`tags`는 빈 배열이었다. 장르의 출처는 아티스트다.
- isrc 404인 트랙도 있다. `USUM71701918`은 MB에 없다.

### 기존 MusicBrainz 보강이 동작하지 않고 있었다

- `apps/web/src/lib/musicbrainz/client.ts:21`의 inc 값이 `artist-credits+releases+release-groups`다. `release-groups`가 isrc 리소스에 유효하지 않아 **모든 요청이 400**이다.
- DB 확인 결과: 보강 잡 11개 `failed`(`last_error_code=musicbrainz_invalid_response`), 90개 `pending`, `completed` 0개. `music_tracks` 101개 전부 `mb_status='pending'`, `mb_recording_id` 채워진 것 0개, `cover_art_url` 채워진 것 0개.
- 현재 스키마(`apps/web/src/lib/db/migrations/003_user_music_library.sql`)에는 `mb_recording_id`, `mb_release_id`, `mb_release_group_id`, `mb_status`, `cover_art_url`는 있지만 **장르 컬럼이 없다**.

## 설계

### 데이터 모델

`music_tracks`에 장르를 보관하는 컬럼을 추가한다.

```sql
ALTER TABLE music_tracks
  ADD COLUMN mb_genres TEXT[] DEFAULT '{}',
  ADD COLUMN mb_tags TEXT[] DEFAULT '{}';
```

- `mb_genres`: MusicBrainz 큐레이션 장르. 임베딩 입력의 우선 출처.
- `mb_tags`: 포크소노미 태그. `mb_genres`가 비었을 때 보조 입력.
- 배열 순서는 MB 응답의 `count` 내림차순을 유지해 가장 투표가 많은 장르가 임베딩 텍스트 앞에 오게 한다.
- 빈 배열 `{}`은 "조색했으나 장르 없음"을 뜻한다. `NULL`은 "아직 보강 안 됨"과 구분한다.

### 보강 흐름

기존 `enrichNextTrack`의 한 잡당 HTTP 요청 수를 1개에서 2개로 늘린다.

```
1. 잡 클레임 (기존 claimEnrichmentJob)
2. rate limit 예약 (기존 reserveMusicBrainzRequest)
3. ISRC 조회: GET /ws/2/isrc/{isrc}?inc=artist-credits+releases&fmt=json
   → 기존 classifyRecordings 로직에서 release 매칭 부분은 isrc 응답에
      releases가 없으므로 사실상 항상 누락. 이번 설계에서 다룬다.
4. rate limit 예약 (두 번째)
5. 아티스트 장르 조회: GET /ws/2/artist/{mbid}?inc=genres+tags&fmt=json
   → recording이 1개 이상이면 artist-credit에서 MBID를 추출해 조회.
6. 잡 완료 처리 (기존 completeEnrichmentJob에 genres, tags 전달)
```

- ISRC가 404(트랙 없음)거나 recording이 0개면 아티스트 MBID를 알 수 없다. 이 경우 `mb_genres={}`, `mb_tags={}`로 저장하고 잡은 `completed`로 닫는다. 장르 없음도 확정된 상태다.
- recording이 여러 개(ambiguous)어도 아티스트 MBID는 추출할 수 있다. 장르는 트랙이 아닌 아티스트 속성이므로 모호성 판정과 분리해서 아티스트만 추출한다.
- 여러 아티스트가 공동으로 표기된 트랙(`Ben Webster & Oscar Peterson`)은 아티스트당 요청이 1개씩 필요하다. 이 프로젝트의 재생 트랙 대부분이 재즈라 아티스트 중복이 많을 것으로 예상된다.

### 아티스트 장르 캐시

**이것이 이 설계의 핵심 절충안이다.**

MusicBrainz rate limit은 초당 1 요청이다. 현재 `musicbrainz_rate_limits` 테이블로 `next_request_at = now() + 1 second`를 예약한다. 아티스트 장르 조회를 트랙마다 매번 하면:

- 101개 트랙 × (ISRC 1 + 아티스트 평균 1.5) ≈ 250 요청 ≈ 4분.
- 아티스트 중복을 무시하면 같은 아티스트의 장르를 반복 요청한다.

장르는 아티스트의 공용 속성이지 사용자의 개인 데이터가 아니다. 따라서 사용자를 가리지 않는 공용 캐시 테이블을 둔다.

```sql
CREATE TABLE musicbrainz_artists (
  mbid UUID PRIMARY KEY,
  name TEXT NOT NULL,
  genres TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- 잡이 아티스트 MBID를 찾으면 `musicbrainz_artists`를 먼저 본다. 있으면 HTTP 요청 없이 캐시 값을 쓴다.
- 없을 때만 아티스트 조회를 하고 캐시에 upsert한다.
- 재즈 트랙 101개의 실제 아티스트는 십여 명 안팎일 것이므로 HTTP 요청은 십여 번으로 줄어든다. 총 요청은 101(ISRC) + ~15(아티스트) ≈ 116건.
- 프로젝트 원칙이 "다른 사용자의 개인 모델·행동 데이터를 혼용하지 않는다"를 둔 것이지, 공용 카탈로그 메타데이터까지 금지한 것은 아니다. 장르는 공용 메타데이터다. 다만 이 해석이 맞는지 사용자 확인이 필요하다(아래 미정 항목).

### 임베딩 입력

`docs/decisions/2026-09-20-personalized-recommendation-baseline.md`의 원칙 1에 따라 트랙 임베딩 입력을 구성한다.

```
{title} | {artistName} | {albumName} | {mb_genres.join(", ")}
```

- `mb_genres`가 빈 배열이면 `mb_tags`의 상위 3개를 붙인다.
- 둘 다 비어 있으면 장르 없이 제목·아티스트·앨범만 임베딩한다. 기존 동작과 동일한 입력에 장르가 추가될 뿐이다.
- 장르를 한국어로 번역하지 않는다. 임베딩 모델이 `paraphrase-multilingual-mpnet-base-v2`이므로 영어 장르명을 그대로 쓴다.

### 기존 버그 수정

이 설계와 함께 `lookupIsrc`의 inc 값을 고친다.

- `apps/web/src/lib/musicbrainz/client.ts:21`: `artist-credits+releases+release-groups` → `artist-credits+releases`
- 이 수정만으로 현재 `failed` 상태인 잡들의 재실행이 400 없이 진행된다.
- release/release-group 커버아트 경로는 이 설계의 범위 밖으로 둔다(아래 범위 밖 참고).

## 변경 범위

- `apps/web/src/lib/db/migrations/006_musicbrainz_genres.sql` (새 파일)
- `apps/web/src/lib/musicbrainz/client.ts` — inc 수정, `lookupArtist` 추가
- `apps/web/src/lib/musicbrainz/enrichment.ts` — 아티스트 장르 추출, `EnrichmentDecision`에 `genres`, `tags` 추가
- `apps/web/src/lib/db/music-library.ts` — `completeEnrichmentJob`에 장르 저장, 캐시 조회·upsert 함수
- 위 파일의 테스트

## 범위 밖

- release/release-group 매칭과 Cover Art Archive 커버아트 경로. isrc 응답에 `releases`가 없어 현재 동작하지 않지만, 장르 확보와 무관하므로 별도 작업으로 둔다.
- 제목·아티스트명으로 MB를 퍼지 검색하는 fallback. ISRC 404 트랙의 장르는 포기한다.
- 사용자에게 장르를 UI에 노출하는 작업. 임베딩 입력이 목적이다.
- 장르 번역·동의어 정규화.
- `musicbrainz_artists` 캐시의 만료·갱신 정책. MB 장르는 느리게 변하므로 일단 영구 캐시로 둔다.

## 완료 기준

1. 보강 잡을 실행해 `music_tracks.mb_genres`가 채워진 행이 존재한다.
2. 같은 아티스트의 두 번째 트랙 보강 시 아티스트 HTTP 요청이 발생하지 않고 캐시 값으로 장르가 채워진다.
3. ISRC가 MB에 없는 트랙은 `mb_genres='{}'`, `mb_status='not_found'`로 잡이 `completed` 상태로 닫힌다.
4. `apps/web`에서 `npm test`, `npm run lint`, `npm run build`가 통과한다.

## 직접 검증

- `apps/web`에서 `npm test`, `npm run lint`, `npm run build`
- migration 적용 후 `music_tracks`의 `mb_genres` 컬럼 존재와 캐시 테이블 존재를 SQL로 확인
- 실제 보강 잡 실행 후 위 3개 완료 기준을 DB 조회로 확인
- MusicBrainz 실제 호출은 rate limit 1초 간격을 지키는지 스크립트로 확인

## 미정 항목

- **사용자 간 공용 캐시 허용 여부.** 프로젝트 원칙의 "개인 모델·행동 데이터 혼용 금지"가 공용 카탈로그 메타데이터까지 금지하는지. 허용하지 않는다면 사용자별로 아티스트 장르를 따로 저장해야 하고 요청 수가 늘어난다.
- **여러 아티스트의 장르를 어떻게 합칠지.** 교집합 vs 투표수 합산 vs 첫 아티스트 우선. 재즈 트랙의 공동 아티스트 표기가 흔해 빈도가 낮지 않다.
- **`mb_tags` 중 장르가 아닌 것(`canadian`, `standards` 같은 국가·시대 태그)의 필터링 여부와 기준.**
- **MusicBrainz 장르의 라이선스.** MB 데이터는 CC0로 알고 있으나 확인이 필요하다. 특히 AI 임베딩 입력으로 쓰는 경우 TIDAL Developer Terms와는 별개의 조건이다.
- **임베딩 입력에서 장르의 가중치.** 제목·아티스트와 같은 텍스트로 이어 붙일지, 별도 필드로 모델에 넘길지.
