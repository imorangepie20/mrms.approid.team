# GMS 언어·장르 반영 랭킹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EMS 곡과 사용자 MMS 곡에 언어·장르 속성을 채운다. 그 속성으로 사용자 분포에 맞지 않는 후보의 순위를 낮추고, 탐색 자리 2곡을 두는 `baseline-v2` 랭킹을 만든다.

**Architecture:** `ems-pipeline`이 공용 속성을 만든다.
- MusicBrainz 덤프에서 릴리스 언어와 recording·release group·artist 태그를 읽는다(MB 단계).
- Last.fm에서 아티스트 태그를 받는다(Last.fm 단계).
- 저장된 사실과 멜론 장르, 문자 판별을 합쳐 곡별 `language`·`genre_buckets`를 계산한다(resolve 단계).

Web은 추천 요청 때 사용자 분포를 DB에서 계산한다. 순수 함수로 감점 배수와 탐색 자리를 정하고, 결과를 `baseline-v2`로 서빙·기록한다.

**Tech Stack:** Python 3.12(psycopg 3, httpx, pytest), Next.js 16 / TypeScript(Vitest, `pg`), PostgreSQL 16.

**Spec:** [docs/superpowers/specs/2026-10-29-language-genre-ranking-design.md](../specs/2026-10-29-language-genre-ranking-design.md)

## Global Constraints

- 마이그레이션은 새 번호 `035_*`와 `035_*.down.sql` 짝으로 추가한다. 적용된 파일은 수정하지 않는다.
- Web 요청 경로에서 외부 API(Last.fm, MusicBrainz, TIDAL)를 호출하지 않는다. 수집은 `ems-pipeline` 명령·루틴만 한다.
- Last.fm 키는 환경변수 `LASTFM_API_KEY`로만 읽는다. 저장소·로그·테스트 fixture에 실제 키를 쓰지 않는다.
- Last.fm 저장 데이터는 아티스트 이름과 태그(이름·count)만이다. 사용자 ID나 라이브러리 출처를 저장하지 않는다. 총량 100MB 이하.
- Last.fm 호출 간격은 1초 이상이다. User-Agent는 기존 `music-pie-ems/0.1 (https://mrms.approid.team)`를 쓴다.
- 감점은 차단이 아니다. 배수 하한은 0보다 크다. 언어·장르를 판별하지 못한 곡(`unknown`, `zxx`)은 감점하지 않는다.
- 사용자 분포는 해당 사용자의 MMS·결정만으로 계산한다.
- 기본 배치 크기 24, 탐색 자리 2(같은 언어·장르로 중복 금지), 새 랭킹 버전 문자열 `baseline-v2`.
- 문서는 한국어로 쓰고, 경로·명령·식별자는 원문을 유지한다.

## Review Focus

- 연주곡(MB 언어 `zxx`)이 많은 재즈 취향: 연주곡 후보는 언어 감점을 받지 않아야 한다. 사용자 분포의 언어 표본에서도 빠져야 한다 → Task 6 테스트 `treats zxx as neutral`.
- 속성이 아직 없는 신규 EMS 곡(속성 테이블에 행 없음): SQL LEFT JOIN 결과가 null이어도 랭킹이 깨지지 않고 감점 1.0이어야 한다 → Task 8 테스트 `keeps candidates without attributes`.
- 표본이 적은 사용자(MMS 속성 판별 곡 < 20): 분포를 믿을 수 없으니 해당 차원 감점을 끈다 → Task 6 테스트 `disables a dimension below minimum sample`.
- 감점 대상 후보가 2곡 미만이거나 모두 같은 언어: 탐색 자리는 있는 만큼만 채우고, 남는 자리는 일반 순위로 채운다. 배치는 여전히 24곡이어야 한다 → Task 6 테스트 `fills exploration slots only when distinct mismatches exist`.
- 아티스트 이름 표기 차이(대소문자·전각·공백): `artist_key`가 같은 키를 만들어야 Last.fm 조회와 속성 연결이 중복되지 않는다 → Task 2 테스트 `normalizes artist keys`.

---

## File Structure

| 파일 | 책임 |
| --- | --- |
| `apps/web/src/lib/db/migrations/035_music_attributes.sql` / `.down.sql` / `.test.ts` | 속성 테이블 3개, `ranking_version` CHECK 확장, 루틴 2행 |
| `services/ems-pipeline/src/ems_pipeline/genre_taxonomy.py` | 태그→장르 버킷·언어 매핑, `TAXONOMY_VERSION`, `artist_key`, 문자 판별 |
| `services/ems-pipeline/src/ems_pipeline/musicbrainz_match.py` | 기존 `backfill_musicbrainz_tags`의 recording 대조 로직 추출(재사용) |
| `services/ems-pipeline/src/ems_pipeline/music_attributes_mb.py` | MB 단계: 덤프에서 언어·태그 사실 저장 |
| `services/ems-pipeline/src/ems_pipeline/lastfm.py` | Last.fm 클라이언트와 아티스트 태그 수집 |
| `services/ems-pipeline/src/ems_pipeline/music_attributes.py` | resolve 단계: 최종 `language`·`genre_buckets` 계산 |
| `services/ems-pipeline/src/ems_pipeline/cli.py`, `source_routines.py` | 명령 3개, 루틴 2개 연결 |
| `apps/web/src/lib/recommendations/attribute-affinity.ts` | 순수 함수: 사용자 분포, 감점, 탐색 자리 |
| `apps/web/src/lib/db/user-attribute-distribution.ts` | 사용자 분포 입력 행 조회 |
| `apps/web/src/lib/recommendations/serving.ts`, `lib/music/types.ts`, `app/api/recommendations/decisions/route.ts` | `baseline-v2` 버전 추가 |
| `apps/web/src/lib/db/gms-recommendations.ts`, `gms-recommendation-batches.ts` | 후보 풀 확장, 속성 조인, v2 랭킹 생성·선택, 배치 24 |
| `apps/web/src/components/recommendations/recommendation-history-list.tsx`, `components/dashboard/music-dashboard.tsx` | 탐색 표시, Last.fm 출처 |
| `apps/web/src/lib/db/attribute-ranking.eval.test.ts` | 운영 읽기 전용 오프라인 평가(환경변수 있을 때만) |

---

### Task 1: 마이그레이션 035

**Files:**
- Create: `apps/web/src/lib/db/migrations/035_music_attributes.sql`, `035_music_attributes.down.sql`, `035_music_attributes.test.ts`

**Interfaces:**
- Produces 테이블:
  - `music_artist_attributes(artist_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, mb_artist_mbid UUID, mb_tags JSONB NOT NULL DEFAULT '[]', mb_language TEXT, mb_snapshot_id TEXT, lastfm_tags JSONB NOT NULL DEFAULT '[]', lastfm_status TEXT NOT NULL DEFAULT 'pending' CHECK (lastfm_status IN ('pending','ok','not_found','failed')), lastfm_error_code TEXT, lastfm_fetched_at TIMESTAMPTZ, created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  - `ems_track_attributes(track_id UUID PRIMARY KEY REFERENCES ems_tracks(id) ON DELETE CASCADE, …공통 컬럼)`
  - `music_track_attributes(track_id UUID PRIMARY KEY REFERENCES music_tracks(id) ON DELETE CASCADE, …공통 컬럼)`
  - 공통 컬럼: `artist_key TEXT NOT NULL, mb_snapshot_id TEXT, mb_recording_mbid UUID, mb_release_language TEXT, mb_tags JSONB NOT NULL DEFAULT '[]', language TEXT NOT NULL DEFAULT 'unknown', language_source TEXT NOT NULL DEFAULT 'none' CHECK (language_source IN ('musicbrainz_release','musicbrainz_artist','lastfm_tag','script','none')), genre_buckets JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(genre_buckets)='object'), genre_source TEXT NOT NULL DEFAULT 'none' CHECK (genre_source IN ('melon','musicbrainz_recording','artist','none')), taxonomy_version TEXT, resolved_at TIMESTAMPTZ`
  - 두 track 테이블에 `artist_key` 인덱스를 둔다.
- `ranking_version` CHECK에 `'baseline-v2'`를 추가한다. 대상은 `user_recommendation_batches.ranking_version`, `user_recommendation_exposures.ranking_version`, `user_recommendation_decisions.ranking_version`, `user_recommendation_shadow_runs.requested_ranking_version`, `served_ranking_version`이다. PostgreSQL 기본 이름 `<table>_<column>_check`을 DROP한 뒤 다시 ADD한다. `shadow_runs.ranking_version = 'hybrid-v0'`는 그대로 둔다.
- `ems_source_routines`에 `('lastfm_artist_tags', 3600)`, `('music_attributes', 21600)` 행을 추가하고, `source_key` CHECK를 확장한다(018 마이그레이션의 기존 목록 + 두 키).
- down은 세 테이블과 두 루틴 행을 삭제하고 CHECK를 원래 목록으로 되돌린다. `baseline-v2` 행이 있으면 down이 실패하는 것이 정상이다. 이를 down 파일 주석에 쓴다.

- [ ] **Step 1: 실패 테스트 작성** (`031_ems_catalog_exclusions.test.ts` 패턴)
  - `stores shared attributes without user identity`: 세 `CREATE TABLE`이 있고, `music_artist_attributes` 블록에 `user_id`가 없다.
  - `allows baseline-v2 everywhere ranking is recorded`: `'baseline-v2'`가 5회 이상 나오고, `user_recommendation_shadow_runs_ranking_version_check`를 건드리지 않는다.
  - `registers both routines`: `'lastfm_artist_tags'`, `'music_attributes'`.
  - `rolls back only new objects`: down에 `DROP TABLE IF EXISTS ems_track_attributes`가 있고, `DROP TABLE IF EXISTS ems_tracks`·`music_tracks`는 없다.
- [ ] **Step 2:** `cd apps/web && npx vitest run src/lib/db/migrations/035_music_attributes.test.ts` → FAIL(파일 없음)
- [ ] **Step 3:** SQL 두 파일 작성(`BEGIN; … COMMIT;`, 기존 파일 형식)
- [ ] **Step 4:** 같은 명령 → PASS. 격리 DB가 있으면 `DATABASE_URL=<격리DB> node scripts/migrate.mjs`로 적용·down·재적용을 확인한다(운영 DB 금지).
- [ ] **Step 5:** 커밋 `feat(db): add music attribute tables and baseline-v2 ranking version`

### Task 2: 장르 분류표·언어·아티스트 키

**Files:**
- Create: `services/ems-pipeline/src/ems_pipeline/genre_taxonomy.py`, `services/ems-pipeline/tests/test_genre_taxonomy.py`

**Interfaces (Produces):**
- `TAXONOMY_VERSION = "2026-10-29.1"`
- `artist_key(name: str) -> str`: NFKC → casefold → 앞뒤 공백 제거 → 연속 공백 1칸.
- `bucket_for_tag(tag: str) -> str | None`: 소문자 비교. 매핑에 없으면 None.
- `MELON_GENRE_BUCKETS: dict[str, str]`: `GN0100→k-ballad, GN0200→k-pop, GN0300→hip-hop, GN0400→r&b-soul, GN0500→k-indie, GN0600→rock, GN0700→trot, GN0800→folk`.
- `language_for_tag(tag: str) -> str | None`: ISO 639-3. 예: `polish→pol`, `french|chanson|chanson française→fra`, `fado|portuguese|mpb|brazilian→por`, `german|schlager|deutsch→deu`, `spanish|latin pop|ranchera→spa`, `turkish→tur`, `russian→rus`, `italian→ita`, `korean|k-pop|trot|k-ballad→kor`, `japanese|j-pop|enka→jpn`, `chinese|mandopop|c-pop|cantopop→zho`.
- `script_language(text: str) -> str | None`: 한글→`kor`, 가나→`jpn`, 한자만→`zho`, 키릴→`rus`, 그 외 None(라틴 문자는 판단하지 않음).
- `buckets_from_tags(tags: list[tuple[str, int]]) -> dict[str, float]`: count 가중 합을 1로 정규화하고, 상위 3버킷만 남긴다. 매핑된 태그가 없으면 `{}`.
- 버킷 목록(출발점): `jazz, blues, classical, pop, rock, metal, hip-hop, r&b-soul, electronic, folk, country, latin, k-pop, k-ballad, k-indie, trot, j-pop, c-pop, chanson, fado, schlager, world, soundtrack, easy-listening, christmas`. 매핑은 MMS 상위 장르(`jazz, vocal jazz, cool jazz, hard bop, post-bop, bebop, swing, big band, modal jazz, contemporary jazz, latin jazz, jazz pop`→jazz, `bossa nova`→latin, `traditional pop, easy listening`→easy-listening)를 반드시 포함한다.

- [ ] **Step 1: 실패 테스트**
  - `test_normalizes_artist_keys`: `artist_key("  Ｎancy   WILSON ") == "nancy wilson"`
  - `test_maps_jazz_subgenres`: `bucket_for_tag("Hard Bop") == "jazz"`, `bucket_for_tag("american") is None`
  - `test_melon_trot`: `MELON_GENRE_BUCKETS["GN0700"] == "trot"`
  - `test_language_tags`: `language_for_tag("fado") == "por"`, `language_for_tag("jazz") is None`
  - `test_script_language`: `script_language("눈물강 레옹강") == "kor"`, `script_language("Pejzaż bez Ciebie") is None`, `script_language("我心似你") == "zho"`
  - `test_buckets_from_tags`: `buckets_from_tags([("jazz",3),("vocal jazz",1),("american",9)]) == {"jazz": 1.0}`
- [ ] **Step 2:** `cd services/ems-pipeline && python -m pytest tests/test_genre_taxonomy.py -v` → FAIL(import)
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat(ems): add genre taxonomy and language heuristics`

### Task 3: MusicBrainz 단계

**Files:**
- Create: `services/ems-pipeline/src/ems_pipeline/musicbrainz_match.py`, `services/ems-pipeline/src/ems_pipeline/music_attributes_mb.py`, `services/ems-pipeline/tests/test_music_attributes_mb.py`
- Modify: `services/ems-pipeline/src/ems_pipeline/musicbrainz_tags.py` (대조 로직을 `musicbrainz_match`로 옮기고 호출만 남김), `services/ems-pipeline/src/ems_pipeline/source_routines.py:23` (`CORE_MEMBERS`)

**Interfaces:**
- Consumes: Task 2 `artist_key`
- Produces:
  - `match_recordings(core: Path, rows: list[dict]) -> dict[str, tuple[int, str]]`
    - rows 키: `id, isrc, title, duration_ms, recording_mbid`
    - 반환: `row id → (recording 내부 id, recording mbid)`
    - 기존 규칙과 같다: mbid 일치, 또는 제목 키 일치이면서 길이 차 ≤ 5,000ms.
  - `CORE_MEMBERS`에 `mbdump/track`, `mbdump/medium`, `mbdump/release`, `mbdump/language`, `mbdump/artist_credit_name`, `mbdump/artist`를 추가한다. 기존 `selected` 캐시는 파일이 없으면 자동으로 다시 추출된다.
  - `collect_musicbrainz_attributes(core: Path, derived_archive: Path, snapshot_id: str) -> dict[str, int]`
    - 대상:
      - `status='active'` EMS 곡 중 `ems_track_attributes.mb_snapshot_id IS DISTINCT FROM snapshot_id`인 곡. recording은 `COALESCE(mb_tag_recording_mbid, recording_mbid)`로 정한다.
      - 선택된 플레이리스트에 속한 `music_tracks`. recording은 `mb_recording_id`로 정하고, 없으면 `isrc`·제목·길이로 대조한다.
    - 저장:
      - track 속성 행 upsert: `artist_key, mb_recording_mbid, mb_release_language, mb_tags, mb_snapshot_id`.
      - `music_artist_attributes` upsert: `display_name, mb_artist_mbid, mb_tags, mb_language, mb_snapshot_id`.
    - 반환 키: `scanned, matched_recordings, with_language, with_tags, artists`
  - 언어 규칙:
    - `mb_release_language`: recording이 실린 릴리스(`track.recording → medium → release.language → language.iso_code_3`) 언어의 최빈값. `mul`은 제외하고 `zxx`는 유지한다.
    - artist `mb_language`: 아티스트가 credit된 모든 릴리스 언어의 최빈값. `zxx`·`mul`은 제외한다.
  - 태그 규칙: track `mb_tags`는 `recording_tag`와 그 recording이 속한 release group의 `release_group_tag`를 합친 `[{"name","count"}]`다. artist `mb_tags`는 `artist_tag`다. derived 아카이브에서 `recording_tag, release_group_tag, artist_tag, tag` 멤버를 읽는다.
  - 덤프 컬럼 위치(MB 스키마):
    - `track(id, gid, recording, medium, …)`
    - `medium(id, release, …)`
    - `release(id, gid, name, artist_credit, release_group, status, packaging, language, …)`
    - `language(id, iso_code_2t, iso_code_2b, iso_code_1, name, frequency, iso_code_3)`
    - `artist_credit_name(artist_credit, position, artist, name, join_phrase)`
    - `artist(id, gid, name, …)`
    - `*_tag(entity, tag, count, …)`
  - 모든 파일은 한 줄씩 스트리밍하고, 필요한 id 집합으로 걸러서 메모리에 올린다.

- [ ] **Step 1: 실패 테스트** (tmp_path에 TSV 몇 줄로 core 디렉터리와 derived tar.bz2를 만든다)
  - `test_match_recordings_matches_by_isrc_title_duration`: 기존 동작을 고정한다(길이 차 6,000ms는 불일치).
  - `test_release_language_mode_keeps_zxx_drops_mul`: recording이 eng 2개, mul 3개 릴리스에 실리면 `eng`. zxx 1개뿐이면 `zxx`.
  - `test_artist_language_ignores_zxx`
  - `test_track_tags_merge_recording_and_release_group`
  - DB 쓰기는 `collect_musicbrainz_attributes`를 순수 계산 함수 `compute_mb_facts(core, derived, targets) -> (track_facts, artist_facts)`와 DB I/O로 나누고, 순수 함수만 단위 테스트한다.
- [ ] **Step 2:** `python -m pytest tests/test_music_attributes_mb.py -v` → FAIL
- [ ] **Step 3:** 구현과 리팩터링. 기존 `tests/`의 musicbrainz 관련 테스트가 계속 통과해야 한다.
- [ ] **Step 4:** `python -m pytest -q` → 전체 PASS(기존 121개 + 신규)
- [ ] **Step 5:** 커밋 `feat(ems): collect MusicBrainz language and tag facts`

### Task 4: Last.fm 아티스트 태그

**Files:**
- Create: `services/ems-pipeline/src/ems_pipeline/lastfm.py`, `services/ems-pipeline/tests/test_lastfm.py`

**Interfaces (Produces):**
- `class LastfmClient(api_key: str, http_client: httpx.Client, min_interval_seconds: float = 1.0)`
  - `top_tags(artist_name: str) -> LastfmResult`
  - 요청: `GET https://ws.audioscrobbler.com/2.0/`, 파라미터 `method=artist.gettoptags, artist, autocorrect=1, api_key, format=json`
  - 결과 타입: `LastfmResult = (status: Literal["ok","not_found","failed"], tags: list[tuple[str,int]], error_code: str | None)`
  - 상위 10개 태그만 저장한다. 응답 `error: 6`이면 `not_found`.
  - 429·5xx·`error: 29`(rate limit)는 지수 백오프로 최대 4회 재시도한 뒤 `failed`.
- `fetch_lastfm_artist_tags(limit: int = 3000, stale_days: int = 90) -> dict[str, int]`
  - 대상: `music_artist_attributes` 중 `lastfm_status='pending'`, 또는 `lastfm_fetched_at < now() - stale_days`, 또는 (`failed`이면서 24시간 경과).
  - 대상 아티스트 행은 Task 3과 Task 5가 만든다. Task 5 resolve가 모든 track 속성의 `artist_key`에 대해 아티스트 행을 `INSERT … ON CONFLICT DO NOTHING`으로 보장한다.
  - 반환 키: `requested, ok, not_found, failed`
  - API 키가 없으면 `RuntimeError("LASTFM_API_KEY missing")`

- [ ] **Step 1: 실패 테스트** (`httpx.MockTransport`)
  - `test_top_tags_returns_first_ten`
  - `test_error_6_is_not_found`
  - `test_retries_rate_limit_then_fails`: `error: 29` 5회 → `failed`, 요청 5회
  - `test_api_key_never_in_error_code`: 실패 결과의 `error_code`에 키 문자열이 없다.
  - `test_waits_min_interval`: 가짜 시계·sleep을 주입해서 연속 두 호출 사이 대기가 1.0초 이상인지 확인한다.
- [ ] **Step 2:** `python -m pytest tests/test_lastfm.py -v` → FAIL
- [ ] **Step 3:** 구현. 시계·sleep은 생성자 인자로 주입한다(기본값 `time.monotonic`, `time.sleep`).
- [ ] **Step 4:** → PASS
- [ ] **Step 5:** 커밋 `feat(ems): fetch Last.fm artist top tags`

### Task 5: resolve 단계, CLI, 루틴

**Files:**
- Create: `services/ems-pipeline/src/ems_pipeline/music_attributes.py`, `services/ems-pipeline/tests/test_music_attributes.py`
- Modify: `services/ems-pipeline/src/ems_pipeline/cli.py`, `services/ems-pipeline/src/ems_pipeline/source_routines.py`

**Interfaces:**
- Consumes: Task 2 함수, Task 3 `collect_musicbrainz_attributes`, Task 4 `fetch_lastfm_artist_tags`
- Produces:
  - `resolve_attributes(facts: TrackFacts, artist: ArtistFacts | None, melon_codes: list[str], title: str, artist_name: str) -> Resolved`
    - `Resolved = (language, language_source, genre_buckets, genre_source)`
  - 언어 우선순위:
    1. `mb_release_language` → `musicbrainz_release`(`zxx` 포함)
    2. artist `mb_language` → `musicbrainz_artist`
    3. Last.fm 태그 중 `language_for_tag`가 있는 태그 가운데 count 최대인 것. 단, 그 태그 count가 아티스트 최대 태그 count의 25% 이상일 때만 → `lastfm_tag`
    4. `script_language(title + " " + artist_name)` → `script`
    5. `unknown`/`none`
  - 장르 우선순위:
    1. 멜론 코드 → `melon`
    2. track `mb_tags`의 `buckets_from_tags`가 비어 있지 않으면 → `musicbrainz_recording`
    3. artist `mb_tags + lastfm_tags`를 합친 `buckets_from_tags` → `artist`
    4. `{}`/`none`
  - `resolve_all(connection, only_stale: bool = True) -> dict[str, int]`
    - 대상: track 속성 행이 없는 활성 EMS 곡·선택 플레이리스트 곡, `taxonomy_version`이 다른 행, `resolved_at`이 아티스트 `updated_at`보다 이전인 행.
    - 행이 없는 곡은 `artist_key(artist)`로 행을 만든다.
    - 멜론 코드는 `ems_track_sources(source_type='melon').source_id → ems_melon_track_genres.genre_code`로 얻는다.
    - 반환 키: `resolved, language_known, genre_known`
  - CLI 명령:
    - `collect-musicbrainz-attributes --core --derived-archive --snapshot-id`
    - `fetch-lastfm-artist-tags --limit 3000`
    - `resolve-music-attributes`
    - 각 명령은 결과 JSON을 출력한다(기존 명령 형식).
  - 루틴:
    - `lastfm_artist_tags`: `LASTFM_API_KEY`가 없으면 `error_code='lastfm_key_missing'`으로 기록하고 건너뛴다. 있으면 fetch를 실행한 뒤 `resolve_all`을 실행한다.
    - `music_attributes`: 기존 `_check_metadata`처럼 core 버전을 확인한다. `ems_track_attributes.mb_snapshot_id`가 다른 활성 곡이 있으면 `collect_musicbrainz_attributes` → `resolve_all` 순서로 실행한다. 디스크 게이트는 기존 `_available_disk`를 재사용한다.

- [ ] **Step 1: 실패 테스트** (`resolve_attributes` 순수 함수)
  - `test_melon_trot_wins_genre`: 멜론 `GN0700` → `{"trot": 1.0}`, `melon`
  - `test_release_language_beats_script`: 제목 한글이고 `mb_release_language="eng"` → `eng`
  - `test_zxx_kept_as_language`: `zxx`, `musicbrainz_release`
  - `test_lastfm_language_requires_weight`: 태그 `[("jazz",100),("french",10)]` → 언어 결정 안 됨(10% < 25%). `[("chanson",100),("jazz",80)]` → `fra`
  - `test_unknown_when_no_signal`: 라틴 제목, 사실 없음 → `unknown`/`none`, 장르 `{}`/`none`
  - `test_cli_registers_commands`: `build_parser().parse_args(["resolve-music-attributes"])`가 성공한다(`tests/test_cli.py` 패턴).
- [ ] **Step 2:** `python -m pytest tests/test_music_attributes.py tests/test_cli.py -v` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** `python -m pytest -q` → 전체 PASS
- [ ] **Step 5:** 커밋 `feat(ems): resolve track language and genre buckets`

### Task 6: 사용자 분포·감점·탐색 (순수 함수)

**Files:**
- Create: `apps/web/src/lib/recommendations/attribute-affinity.ts`, `attribute-affinity.test.ts`

**Interfaces (Produces):**
```ts
export const ATTRIBUTE_RANKING = {
  minimumSample: 20,
  languageFullShare: 0.15,
  genreFullShare: 0.1,
  languageFloor: 0.55,
  genreFloor: 0.7,
  rejectWeight: -0.5,
  explorationSlots: 2,
} as const; // 출발값. Task 10 평가로 조정한다.

export type TrackAttributes = { language: string; genreBuckets: Record<string, number> };
export type DistributionInput = TrackAttributes & { weight: number }; // MMS·accept=1, reject=rejectWeight
export type AttributeDistribution = {
  languages: Record<string, number>; genres: Record<string, number>;
  languageSample: number; genreSample: number;
};
export type AttributeFit = {
  languageFit: number | null; genreFit: number | null; multiplier: number;
  mismatchKey: string | null; reasonCodes: string[];
};
export function buildAttributeDistribution(items: DistributionInput[]): AttributeDistribution;
export function scoreAttributeFit(distribution: AttributeDistribution, candidate: TrackAttributes | null): AttributeFit;
export function placeExplorationSlots<T extends { id: string; fit: AttributeFit; baseScore: number }>(
  ranked: T[], limit: number,
): Array<T & { exploration: boolean }>;
```
- 분포 계산:
  - 언어별 가중치 합을 구한다. 음수는 0으로 자르고, 양수 합으로 나눠 비중을 만든다.
  - `unknown`·`zxx`는 언어 계산에서 빼고 `languageSample`에도 세지 않는다.
  - 장르는 `genreBuckets × weight` 합으로 같은 방식으로 계산한다.
  - sample은 양수 weight 항목 수다.
- 적합도:
  - `languageFit = min(1, share / languageFullShare)`
  - 장르 적합도는 후보 버킷마다 `min(1, share / genreFullShare)`를 구해 후보 가중 평균한다.
  - 차원별 배수: `floor + (1 - floor) × fit`. 전체 배수는 두 배수의 곱이다.
  - 차원 sample이 `minimumSample` 미만이거나 후보 값이 없으면 그 차원은 `fit=null`, 배수 1이다.
- `reasonCodes`: fit < 1이면 `language_mismatch`·`genre_mismatch`를 넣는다.
- `mismatchKey`: 불일치 차원의 값이다. 예: `"lang:por"`, `"genre:trot"`. 언어를 우선한다.
- `placeExplorationSlots`:
  - 입력은 감점 적용 순위다.
  - 출력은 앞에서부터 `limit - explorationSlots`개 일반 곡과 탐색 곡이다.
  - 탐색 곡 고르는 법: 일반 곡에 들지 않은 후보 중 `mismatchKey`가 있는 곡을 `baseScore`(감점 전) 내림차순, id 오름차순으로 훑는다. `mismatchKey`가 서로 다른 곡을 최대 2개 고른다.
  - 탐색 곡은 일반 곡 뒤가 아니라 위치 8과 16(1부터 셈)에 끼운다.
  - 부족하면 일반 순위로 채운다. 탐색 곡의 `reasonCodes`에 `exploration`을 더한다.

- [ ] **Step 1: 실패 테스트** (Vitest)
  - `penalizes a language absent from the distribution down to the floor`: eng 30곡 분포, 후보 `por` → multiplier `0.55`, `language_mismatch`
  - `does not penalize a language above the full share`: 후보 `eng` → multiplier `1`
  - `treats zxx as neutral`: 후보 `zxx` → `languageFit` null, multiplier 1. 분포 입력에 zxx 50곡이 있어도 `languageSample`에 들어가지 않는다.
  - `disables a dimension below minimum sample`: 언어 19곡 → `languageFit` null
  - `reject lowers but never removes a language`: kor accept 0 + MMS kor 5 + reject kor 8 → kor 비중 ≥ 0
  - `fills exploration slots only when distinct mismatches exist`: 후보 30개 중 불일치가 `lang:por` 2곡뿐이면 탐색 1곡, 결과 길이 24
  - `places exploration at positions 8 and 16`
- [ ] **Step 2:** `cd apps/web && npx vitest run src/lib/recommendations/attribute-affinity.test.ts` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** → PASS
- [ ] **Step 5:** 커밋 `feat(gms): add attribute affinity scoring and exploration slots`

### Task 7: `baseline-v2` 버전 배선

**Files:**
- Modify: `apps/web/src/lib/recommendations/serving.ts`, `serving.test.ts`, `apps/web/src/lib/music/types.ts:24`, `apps/web/src/lib/recommendations/gms.ts:16`, `apps/web/src/app/api/recommendations/decisions/route.ts:23`(+테스트)

**Interfaces (Produces):**
- `RecommendationRankingVersion = "baseline" | "baseline-v2" | "hybrid-v0"`. `Track.recommendation.rankingVersion`과 `RecommendationDecisionInput.rankingVersion`도 같은 유니온이다.
- `parseRecommendationServingConfig`: `GMS_RANKING_VERSION`이 `"baseline-v2"`이면 그 값을 요청 버전으로 쓴다.
- `decideRecommendationServing`에 입력 `attributeRankingAvailable: boolean`을 추가한다.
  - 요청이 `baseline-v2`이고 available이면 `servedRankingVersion: "baseline-v2"`, `fallbackReason: null`. allowlist는 보지 않는다.
  - 요청이 `baseline-v2`인데 unavailable이면 `baseline`으로 가고, 새 fallback 사유는 `"attribute_profile_unavailable"`이다.
  - 기존 hybrid 분기는 그대로 둔다.
- decisions route는 세 값을 모두 허용한다.

- [ ] **Step 1: 실패 테스트**
  - `serves baseline-v2 without allowlist`
  - `falls back when attribute ranking is unavailable`: fallbackReason `attribute_profile_unavailable`
  - route: `accepts baseline-v2 decisions`. 기존 `rejects unknown ranking version` 테스트가 있으면 유지한다.
- [ ] **Step 2:** `npx vitest run src/lib/recommendations/serving.test.ts src/app/api/recommendations/decisions` → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** → PASS, `npx tsc --noEmit` 통과
- [ ] **Step 5:** 커밋 `feat(gms): add baseline-v2 serving version`

### Task 8: 추천 준비 경로에 v2 랭킹 연결

**Files:**
- Create: `apps/web/src/lib/db/user-attribute-distribution.ts`
- Modify: `apps/web/src/lib/db/gms-recommendations.ts`, `gms-recommendations.test.ts`, `gms-recommendations.postgres.test.ts`, `apps/web/src/lib/db/gms-recommendation-batches.ts:14`

**Interfaces:**
- Consumes: Task 6 전부, Task 7 `attributeRankingAvailable`
- Produces:
  - `loadUserAttributeDistributionInputs(userId: string, executor?: TransactionExecutor): Promise<DistributionInput[]>`
    - SQL 주석 `/* user_attribute_distribution */`
    - 선택된 MMS 플레이리스트 곡(`music_track_attributes`, weight 1)과 `user_recommendation_decisions`의 accept(1)·reject(`rejectWeight`)를 `ems_track_attributes`와 조인한 결과다.
    - 같은 곡은 한 번만 센다.
  - `EmsCandidateRow`에 `language: string | null`, `genre_buckets: Record<string, number> | null`을 추가한다(SQL `LEFT JOIN ems_track_attributes`).
  - SQL 후보 한도 `$3`을 `Math.min(600, safeLimit * 25)`로 바꾼다.
    - 기존 baseline은 지금처럼 `sourceRank <= candidatePoolSize(=min(120, limit*5))`만 쓴다. 이렇게 하면 기존 baseline 결과가 바뀌지 않는다.
    - hybrid도 지금처럼 앞의 `candidatePoolSize`개만 쓴다.
  - `PreparedPersonalizedRecommendations`에 `attributeRecommendations: PersonalizedRecommendations | null`을 추가한다.
    - 만드는 법: 전체 행에 `rankEmsCandidates`를 적용한다. 각 행 score에 `scoreAttributeFit(...).multiplier`를 곱한다. 그 다음 `placeExplorationSlots(…, safeLimit)`를 적용한다.
    - `rankEmsCandidates`는 행의 선택 필드 `attribute_multiplier?: number`(기본 1)를 `calculateEmsScore` 결과에 곱한다.
    - `scoreComponents`에 `attributeMultiplier`, `languageFit`, `genreFit`(null이면 생략)을 기록한다.
    - 분포의 두 차원이 모두 sample 미달이면 `null`이다.
    - `PersonalizedRecommendations`에 선택 필드 `attributeProfile?: AttributeDistribution & { taxonomyVersion: string | null }`를 추가하고 v2 결과에만 채운다.
    - `taxonomyVersion`은 분포 입력 행의 `taxonomy_version` 최빈값이다.
    - 이 값은 배치 `recommendations` JSONB에 그대로 저장되어 추적 근거가 된다(스펙 7절).
    - 테스트 `stores the attribute profile with the v2 batch`를 Step 1에 포함한다.
  - `mapRecommendation(row, rankingVersion)`: v2는 `reasonCodes`에 fit의 이유 코드와 `exploration`을 합친다.
  - `selectPreparedPersonalizedRecommendations`:
    - `attributeRankingAvailable: prepared.attributeRecommendations !== null`을 넘긴다.
    - served가 `baseline-v2`이면 `prepared.attributeRecommendations`를 반환한다.
  - `DEFAULT_BATCH_SIZE = 24`

- [ ] **Step 1: 실패 테스트** (`gms-recommendations.test.ts`, 기존 mock executor 패턴. `/* user_attribute_distribution */` 주석으로 응답을 나눈다)
  - `keeps baseline ranking unchanged when the pool grows`: 기존 baseline 기대값 테스트가 그대로 통과한다. 후보 SQL 파라미터 `$3`은 `limit × 25`(최대 600)다.
  - `keeps candidates without attributes`: `language`·`genre_buckets`가 null인 행 → `attributeMultiplier` 1, 오류 없음
  - `demotes mismatched language in baseline-v2`: eng 분포 30, 후보 A(por, 유사도 0.9)·B(eng, 0.8) → v2 첫 곡이 B, baseline 첫 곡은 A
  - `marks exploration tracks`: v2 결과 중 `exploration` 이유 코드가 있는 곡이 `mismatchKey`가 서로 다른 곡으로 최대 2곡
  - `returns null attribute recommendations below sample`
  - `serves baseline-v2 when requested`: `selectPreparedPersonalizedRecommendations(…, { GMS_RANKING_VERSION: "baseline-v2" })` → `rankingVersion: "baseline-v2"`
- [ ] **Step 2:** `npx vitest run src/lib/db/gms-recommendations.test.ts src/lib/db/gms-recommendation-batches.test.ts` → FAIL
- [ ] **Step 3:** 구현. 기존 batches 테스트의 기본 12 기대값은 24로 갱신한다.
- [ ] **Step 4:** → PASS. 격리 DB가 있으면 `RECOMMENDATION_SHADOW_TEST_DATABASE_URL=<격리DB> npx vitest run src/lib/db/gms-recommendations.postgres.test.ts`로 실제 SQL을 확인한다.
- [ ] **Step 5:** 커밋 `feat(gms): rank baseline-v2 with language and genre fit`

### Task 9: 화면 표시

**Files:**
- Modify: `apps/web/src/components/recommendations/recommendation-history-list.tsx`(+`.test.tsx`), `apps/web/src/components/dashboard/music-dashboard.tsx`(+`.test.tsx`), 관련 CSS(기존 클래스 파일)

**Interfaces:**
- Consumes: 트랙 `recommendation.reasonCodes`의 `"exploration"`
- 탐색 표시:
  - 곡 제목 옆에 작은 배지 `새로운 시도`를 단다.
  - `title` 또는 보조 텍스트 `평소 취향과 다른 언어·장르에서 골랐어요`를 넣는다.
  - 색만으로 구분하지 않는다(텍스트 포함).
- 출처 표기: GMS 섹션 하단에 `장르 정보 일부 제공: <a href="https://www.last.fm" rel="noopener noreferrer" target="_blank">Last.fm</a>`을 넣는다.

- [ ] **Step 1: 실패 테스트**
  - `shows exploration badge only for exploration tracks`
  - `renders Last.fm attribution link`
- [ ] **Step 2:** `npx vitest run src/components/recommendations src/components/dashboard/music-dashboard.test.tsx` → FAIL
- [ ] **Step 3:** 구현. UI 작업이므로 `ui-ux-pro-max`·`web-design-guidelines` 기준을 확인하고 기존 배지 스타일을 재사용한다.
- [ ] **Step 4:** → PASS. `npm run lint`, `npm run build` 통과. 모바일 폭(375px)에서 배지가 줄바꿈되어도 버튼을 가리지 않는지 확인한다.
- [ ] **Step 5:** 커밋 `feat(gms): label exploration picks and credit Last.fm`

### Task 10: 커버리지 측정·오프라인 평가·기록

**Files:**
- Create: `apps/web/src/lib/db/attribute-ranking.eval.test.ts`, `docs/changes/2026-10-29-language-genre-ranking.md`
- Modify: `docs/runbooks/ems-catalog-ingestion.md`(새 명령·루틴·`LASTFM_API_KEY`), `docs/README.md`, `docs/overview/current-development-context.md`

**Interfaces:**
- Consumes: Task 5 명령, Task 8 `preparePersonalizedEmsRecommendations`
- 평가 테스트:
  - `describe.runIf(Boolean(process.env.ATTRIBUTE_RANKING_EVAL_DATABASE_URL))`로 감싼다.
  - `BEGIN READ ONLY` 트랜잭션 executor로 `ATTRIBUTE_RANKING_EVAL_AUTH0_SUBJECT`의 prepare를 실행한다.
  - baseline과 baseline-v2 각 24곡의 언어 분포, 장르 버킷 분포, 탐색 곡을 `console.table`로 출력한다.
  - assertion:
    - v2 일반 22곡에 `genre:trot`가 없다.
    - v2 일반 22곡의 언어 분포와 MMS 분포의 총변동거리가 baseline보다 작다.
  - 마지막에 ROLLBACK한다.

- [ ] **Step 1: 커버리지 측정(배포 전, 사용자 승인 후 운영에서)**
  - 운영 반영(마이그레이션·이미지)은 사용자 요청이 있을 때만 한다.
  - 승인되면 `collect-musicbrainz-attributes`, `fetch-lastfm-artist-tags --limit 500`(샘플), `resolve-music-attributes`를 실행한다.
  - 읽기 전용 SELECT로 활성 EMS와 해당 사용자 MMS의 `language <> 'unknown'` 비율, `genre_buckets <> '{}'` 비율을 기록한다.
  - MMS 언어 판별률(`unknown`·`zxx` 제외)이 낮아 `minimumSample` 20을 넘지 못하면 멈추고 사용자에게 보고한다(스펙 7절).
- [ ] **Step 2: 평가 실행**: SSH 터널을 통해 `ATTRIBUTE_RANKING_EVAL_DATABASE_URL=… ATTRIBUTE_RANKING_EVAL_AUTH0_SUBJECT=… npx vitest run src/lib/db/attribute-ranking.eval.test.ts`
  - 기대: PASS. 실패하면 `ATTRIBUTE_RANKING` 상수만 조정하고 Task 6 테스트 기대값을 함께 갱신한다.
- [ ] **Step 3: 전체 검증**
  - `cd apps/web && npm test && npm run lint && npx tsc --noEmit && npm run build`
  - `cd services/ems-pipeline && python -m pytest -q`
  - 모두 통과해야 한다.
- [ ] **Step 4: 기록**
  - 변경 기록에 다음을 쓴다: 이유, 변경, 커버리지 수치, 평가 표, 검증 명령 결과, 미검증(운영 배포·`GMS_RANKING_VERSION=baseline-v2` 전환은 사용자 요청 시), 다음 작업.
  - 런북에 새 명령, 루틴, `LASTFM_API_KEY` 위치(`shared/secrets`의 ems-pipeline env)를 쓴다.
- [ ] **Step 5:** 커밋 `docs: record language/genre ranking work`
