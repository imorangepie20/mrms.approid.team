# 메인·EMS 에디토리얼 섹션 설계

## 목적

메인과 EMS 페이지를 사용자가 지금 들을 음악을 고를 수 있는 하나의 에디토리얼 큐레이션 체계로 바꾼다. 섹션 제목은 `신곡 퍼레이드`, `시원한 가을 바람과 함께, 재즈`처럼 장르 코드가 아니라 청취 상황과 분위기를 제안하는 문구를 사용한다.

메인은 짧고 탐색하기 쉬운 입구로서 우선순위가 높은 3개 섹션을 보여주고, EMS는 전체 4~5개 섹션과 카탈로그 검색을 제공한다. 두 페이지는 같은 API와 section rail 컴포넌트를 사용해 제목, 곡 순서, 재생 동작이 서로 어긋나지 않게 한다.

현재 EMS API가 제공하지 않는 Spotify·Apple Music 필터를 제거한다. 화면에 표시하는 분류는 제목이나 아티스트 문자열을 추측해 만들지 않고 TIDAL 공개 에디토리얼 플레이리스트에 포함된 근거로만 생성한다.

## 사용자 경험

메인 화면은 다음 순서로 구성한다.

1. 기존 메인 hero
2. `신곡 퍼레이드`를 포함한 우선순위 상위 3개 에디토리얼 섹션
3. 각 section의 `EMS에서 더 보기` 링크

메인의 기존 fixture 기반 `오늘의 발견`, `지금 흐르는 플레이리스트`는 실제 데이터 기반 section rail로 교체한다. 로그인하지 않은 사용자도 공개 EMS 카탈로그를 탐색하고 재생 시 기존 TIDAL 연결 흐름을 따른다.

EMS 첫 화면은 다음 순서로 구성한다.

1. 기존 EMS 헤더와 짧은 설명
2. 카탈로그 검색 입력
3. 4~5개의 에디토리얼 섹션
4. 검색어가 있을 때는 섹션 대신 검색 결과 목록

초기 섹션 문구는 다음을 기준으로 한다.

| slug | 제목 | 설명 | 소스 기준 |
| --- | --- | --- | --- |
| `new-releases` | 신곡 퍼레이드 | 지금 막 도착한 새로운 음악 | 신곡·최근 인기 TIDAL 에디토리얼 |
| `seasonal-jazz` | 시원한 가을 바람과 함께, 재즈 | 여유로운 재즈 셀렉션 | Jazz 에디토리얼 |
| `night-rnb` | 도시의 밤을 채우는 R&B | 늦은 시간에 어울리는 부드러운 트랙 | R&B 에디토리얼 |
| `feel-good` | 기분 좋은 리듬이 필요할 때 | 팝과 댄스 중심의 경쾌한 음악 | Pop·Dance 에디토리얼 |
| `focus` | 잠깐, 음악에만 집중 | 클래식과 차분한 연주곡 | Classical·Focus 에디토리얼 |

제목과 설명은 데이터베이스에 저장해 프런트엔드 배포 없이 운영자가 수정할 수 있게 한다. `seasonal-jazz`처럼 계절성이 있는 제목은 자동으로 날짜를 추측하지 않고 운영 시점에 명시적으로 갱신한다.

각 섹션은 최대 12곡을 가로형 rail로 표시한다. 한 응답 안에서 같은 EMS 트랙은 우선순위가 높은 섹션에만 노출한다. 키보드 탐색, 모바일 가로 스크롤, 재생 및 좋아요 기능은 기존 음악 컴포넌트의 동작을 유지한다.

## 데이터 모델

신규 migration `009_ems_editorial_sections.sql`에 두 테이블을 추가한다.

### `ems_editorial_sections`

- `id UUID PRIMARY KEY`
- `slug TEXT UNIQUE NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `sort_order INTEGER NOT NULL`
- `active BOOLEAN NOT NULL DEFAULT true`
- `updated_at TIMESTAMPTZ NOT NULL`

### `ems_track_sections`

- `section_id UUID REFERENCES ems_editorial_sections(id) ON DELETE CASCADE`
- `track_id UUID REFERENCES ems_tracks(id) ON DELETE CASCADE`
- `rank INTEGER NOT NULL`
- `source_playlist_id TEXT NOT NULL`
- `source_playlist_name TEXT NOT NULL`
- `last_seen_at TIMESTAMPTZ NOT NULL`
- `(section_id, track_id)` 복합 primary key

카테고리 membership은 기존 1,000곡 artifact 형식을 바꾸지 않는다. 별도 `sync-editorial-sections` 작업이 TIDAL 에디토리얼 플레이리스트를 읽고, ISRC 또는 이미 확정된 TIDAL ID로 기존 `ems_tracks`와 조인한 뒤 두 테이블을 갱신한다. 따라서 아직 EMS에 승격되지 않은 외부 트랙은 화면에 노출하지 않는다.

동기화는 새 membership을 upsert하고 이번 실행에서 다시 확인되지 않은 기존 membership을 제거한다. 이 교체는 section 단위 transaction으로 수행해 중간 상태를 노출하지 않는다. 원본 플레이리스트 ID와 이름을 보존해 분류 근거를 추적할 수 있게 한다.

## 섹션 동기화

`services/ems-pipeline`에 섹션 정의와 동기화 명령을 추가한다.

- 각 정의는 `slug`, 표시 문구, TIDAL 검색어, 허용할 에디토리얼 플레이리스트 이름 규칙을 가진다.
- 공개 `EDITORIAL` 플레이리스트만 사용한다.
- KR `STREAM`, 30초 이상, ISRC 보유 조건을 유지한다.
- 신곡 섹션은 최근 수정된 신곡 에디토리얼과 트랙의 TIDAL popularity·playlist position을 함께 사용한다.
- 나머지 섹션은 playlist follower, TIDAL popularity, playlist position을 조합해 순위를 만든다.
- 한 섹션 안에서는 ISRC 중복을 제거한다.
- access token, raw 응답, secret은 DB나 로그에 저장하지 않는다.
- pagination은 TIDAL API origin만 허용하고 page 상한과 반복 cursor 방지를 유지한다.

동기화 결과는 섹션별 발견 수, EMS 조인 수, 저장 수만 출력한다. 운영 적용 전 dry-run으로 각 섹션에 충분한 기존 EMS 트랙이 있는지 확인한다.

## API

신규 `GET /api/ems/sections`를 추가한다.

요청:

- `region=KR`만 허용
- `limit`은 섹션당 1~12, 기본 12
- `sectionLimit`은 1~5, 기본 5. 메인은 3, EMS는 5를 사용

응답:

```json
{
  "totalCount": 1000,
  "sections": [
    {
      "slug": "new-releases",
      "title": "신곡 퍼레이드",
      "description": "지금 막 도착한 새로운 음악",
      "tracks": []
    }
  ]
}
```

조회 대상은 기존 EMS 공개 조건을 그대로 적용한다.

- `ems_tracks.status = 'active'`
- 요청 region에서 최신 availability가 `STREAM/playable=true`

EMS는 외부 카탈로그 탐색 공간이므로 임베딩 완료 여부를 노출 조건으로 사용하지 않는다. `ems_track_embeddings`는 GMS 추천과 취향 계산의 준비 상태이며, 임베딩 작업이 지연되더라도 검증된 EMS 트랙 탐색과 재생을 막지 않는다. 기존 `/api/ems/catalog`의 embedding `EXISTS` 조건도 함께 제거한다.
- active section만 반환

섹션은 `sort_order`, 트랙은 `rank` 순으로 반환한다. 앞 섹션에서 반환한 track은 뒤 섹션에서 제외한다. `totalCount`는 현재 필터에 맞는 전체 EMS 트랙 수이며, 첫 페이지에 로드된 배열 길이를 총 트랙으로 표시하지 않는다.

TIDAL 또는 동기화 작업은 페이지 요청 경로에 포함하지 않는다. API는 저장된 EMS 데이터만 읽으므로 외부 서비스 장애가 페이지 응답을 지연시키지 않는다.

## 프런트엔드

공유 `EditorialSectionRail`은 section 제목·설명·트랙 목록·playback source를 입력받는다. 메인과 EMS는 이 컴포넌트를 사용하고 페이지별로 별도 fixture나 section 문구를 복제하지 않는다.

메인은 `/api/ems/sections?limit=12&sectionLimit=3`을 호출한다.

- 기존 hero는 유지하되 fixture 숫자와 정적 앨범 rail을 제거한다.
- API가 반환한 우선순위 상위 3개 section을 렌더링한다.
- section별 `EMS에서 더 보기`는 `/ems`로 이동한다.
- 메인 API 실패는 hero를 유지하고 큐레이션 영역에 독립적인 오류 상태를 표시한다.

`EmsBrowser`는 초기 로드에서 `/api/ems/sections`를 호출한다.

- 플랫폼 버튼 `전체/Tidal/Spotify/Apple Music`을 제거한다.
- hero의 숫자는 `totalCount`를 사용한다.
- 각 section은 제목, 설명, 트랙 rail로 렌더링한다.
- rail은 기존 재생 queue와 좋아요 동작을 사용하며 section slug를 playback source ID로 전달한다.
- 검색 입력에는 짧은 debounce를 적용한다.
- 검색어가 비어 있으면 에디토리얼 섹션, 검색어가 있으면 기존 `/api/ems/catalog` 검색 결과를 보여준다.
- loading, API 오류, 섹션 준비 중, 검색 결과 없음 상태를 서로 다른 문구로 표시한다.
- 12곡을 한 번에 모두 가로로 늘어놓되 모바일은 swipe/scroll, 데스크톱은 키보드와 스크롤로 접근할 수 있게 한다.

## 실패와 빈 상태

- 섹션 API 오류: `큐레이션을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`
- 동기화 전 섹션 0개: `새로운 큐레이션을 준비하고 있습니다.`
- 특정 섹션의 트랙이 0개면 그 섹션은 응답에서 제외한다.
- 검색 결과 0개: `검색 결과가 없습니다.`
- 검색 요청 실패는 이미 로드된 에디토리얼 섹션을 삭제하지 않는다. 검색어를 지우면 기존 섹션으로 즉시 돌아간다.

## 검증

### Pipeline

- 섹션 정의별 TIDAL 플레이리스트 필터와 순위
- ISRC 중복 제거와 기존 EMS track 조인
- section 단위 upsert·stale membership 제거 transaction
- dry-run에서 DB write가 없는지 확인
- 외부 pagination origin·반복 cursor·page limit 검증

### API

- active·최신 KR stream 조건과 embedding 비의존성
- section/track 정렬
- 섹션 간 track 중복 제거
- `totalCount` 정확성
- 잘못된 region·limit 거부

### UI

- 메인과 EMS가 같은 section 제목·트랙 순서를 사용
- 메인은 상위 3개, EMS는 전체 section 표시
- 메인의 fixture 기반 album·playlist rail 제거
- 초기 화면에 승인된 제목과 설명 표시
- 가짜 플랫폼 필터 미표시
- API `totalCount` 표시
- 검색 시 결과 목록 전환, 검색어 제거 시 section 복귀
- loading·error·empty 상태
- 키보드와 모바일 가로 스크롤

## 완료 조건

- 운영 데이터에서 최소 4개 섹션이 비어 있지 않다.
- 각 섹션은 6~12곡을 반환하고 한 응답에서 같은 track을 반복하지 않는다.
- `신곡 퍼레이드`는 신곡 에디토리얼 근거가 있는 트랙만 포함한다.
- 장르·분위기 섹션은 저장된 TIDAL 플레이리스트 provenance로 설명 가능하다.
- EMS 페이지에 작동하지 않는 플랫폼 필터와 잘못된 총 트랙 수가 남아 있지 않다.
- 메인에 fixture 기반 추천·플레이리스트가 남아 있지 않고 실제 EMS section 3개가 표시된다.
- 관련 pipeline·API·UI 테스트와 Web lint/build가 통과한다.
