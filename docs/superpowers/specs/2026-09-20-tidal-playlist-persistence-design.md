# TIDAL 플레이리스트 영속화와 MusicBrainz 보강 설계

## 목적

사용자가 TIDAL 연결 후 자신의 플레이리스트를 조회하고 하나 이상 선택해 music-pie에 저장할 수 있게 한다. 선택한 플레이리스트의 트랙은 ISRC를 기준으로 MusicBrainz 메타데이터를 보강하고 실제 앨범 이미지를 표시한다. TIDAL 연결을 해제해도 이미 저장한 플레이리스트, 트랙, 보강 결과, 이미지 참조와 이를 이용한 MMS 데이터는 유지하며, 재연결 시 기존 데이터에 이어서 동기화한다.

## 범위

- 인증된 사용자의 TIDAL 플레이리스트 목록 조회
- 하나 이상의 플레이리스트 선택과 서버 저장
- 선택한 플레이리스트의 전체 트랙 페이지네이션 수집
- 트랙·앨범·아티스트·ISRC·이미지 참조의 사용자별 영속화
- ISRC 기반 MusicBrainz recording/release/release-group 보강
- Cover Art Archive 앨범 이미지 대체 경로
- 가져오기와 보강 진행 상태 및 오류 표시
- TIDAL 연결 해제와 재연결
- 기존 온보딩의 가짜 플레이리스트·메모리 전용 MMS 초기화를 실제 API 흐름으로 교체

## 범위 밖

- 자동 주기 동기화
- TIDAL 플레이리스트 쓰기·수정
- 제목·아티스트 이름만을 이용한 MusicBrainz 퍼지 검색
- MusicBrainz에서 여러 recording 후보가 나온 경우 자동 선택
- 이미지 바이너리의 자체 복제·저장
- 추천 모델 학습 알고리즘 변경
- 관리자용 수동 매칭 화면

## 설계 원칙

1. 모든 사용자 데이터 조회·변경은 Auth0 `sub`로 내부 `app_users.id`를 확인한 뒤 그 `user_id` 범위에서 수행한다.
2. 브라우저는 TIDAL access token이나 refresh token을 받지 않는다. 외부 API 호출은 서버에서만 수행한다.
3. 원본 TIDAL ID와 ISRC는 출처 식별자이고, music-pie 내부 UUID를 관계의 기본 키로 사용한다.
4. 동일 사용자의 같은 TIDAL 플레이리스트·트랙은 upsert해 재가져오기와 재연결에서 중복을 만들지 않는다.
5. MusicBrainz는 ISRC가 있을 때만 조회하고 모호한 결과를 임의로 확정하지 않는다.
6. 외부 API 실패는 이미 저장된 데이터와 분리한다. TIDAL 가져오기 성공 후 MusicBrainz 보강이 실패해도 가져온 데이터는 사용할 수 있다.
7. 연결 해제는 동기화 권한과 토큰 수명주기만 종료한다. 저장한 음악 데이터의 소유 상태는 바꾸지 않는다.

## 시스템 구성

### TIDAL API 어댑터

`src/lib/tidal/api.ts`가 TIDAL JSON:API 응답을 애플리케이션 타입으로 변환한다. 다음 책임만 가진다.

- bearer token과 국가 코드를 포함한 요청 생성
- 현재 사용자가 소유한 플레이리스트 페이지 조회
- 플레이리스트의 `items` 관계를 `links.next`가 없어질 때까지 순회
- track, album, artist, artwork 관계의 `included` 자원 결합
- 외부 응답을 `TidalPlaylistSummary`와 `TidalTrackSnapshot`으로 정규화
- 401/403을 재인증 필요 오류로, 429와 5xx를 재시도 가능 오류로 분류

TIDAL의 cursor URL은 어댑터 밖에서 조립하지 않는다. 최초 URL만 구성하고 이후 페이지는 응답의 `links.next`를 그대로 따라간다.

### 플레이리스트 가져오기 서비스

`src/lib/playlists/import-playlists.ts`가 다음 순서로 동작한다.

1. 현재 사용자의 연결과 복호화된 access token을 확인한다.
2. 요청한 플레이리스트 ID가 현재 사용자에게 조회된 목록에 포함되는지 확인한다.
3. `playlist_imports`에 `running` 작업을 생성한다.
4. 플레이리스트와 모든 트랙을 페이지 단위 트랜잭션으로 upsert한다.
5. 각 플레이리스트에 포함된 트랙 순서와 추가 시각을 `user_playlist_tracks`에 저장한다.
6. ISRC가 있는 미보강 트랙에 `musicbrainz_enrichment_jobs`를 생성한다.
7. 수집이 끝나면 작업을 `completed`로 바꾸고 저장된 플레이리스트·트랙 수를 기록한다.

한 페이지 저장이 실패하면 해당 페이지 트랜잭션만 롤백하고 가져오기 작업은 `failed`가 된다. 이전에 완료한 페이지와 기존 스냅샷은 유지한다. 같은 선택을 다시 요청하면 upsert와 고유 키를 통해 안전하게 재개한다.

### MusicBrainz 보강 서비스

`src/lib/musicbrainz/client.ts`는 `https://musicbrainz.org/ws/2/isrc/{isrc}`를 JSON으로 조회하고 식별 가능한 `User-Agent`를 보낸다. `src/lib/musicbrainz/enrichment.ts`는 DB 큐에서 한 작업씩 가져와 다음 규칙을 적용한다.

- 결과 없음: `not_found`
- 서로 다른 recording MBID가 하나: `matched`
- 서로 다른 recording MBID가 둘 이상: `ambiguous`
- 503 또는 네트워크 오류: 재시도 횟수와 다음 시각을 기록하고 `pending`
- 파싱 불가 응답: `failed`

`matched`인 경우 recording MBID와 연결된 release/release-group 후보를 저장한다. TIDAL 앨범명과 정규화된 제목이 일치하는 공식 release가 하나면 그 release와 release-group MBID를 대표값으로 선택한다. 유일하게 결정되지 않으면 recording까지만 확정하고 release 상태를 `ambiguous`로 둔다.

MusicBrainz 호출은 프로세스 전체에서 초당 1회 이하가 되도록 PostgreSQL advisory lock과 `musicbrainz_rate_limits.next_request_at`을 사용한다. `POST /api/musicbrainz/enrich`는 최대 한 작업을 처리하며, 온보딩 화면은 완료되지 않은 작업이 있을 동안 이 경로를 제한적으로 다시 호출한다.

### 앨범 이미지

트랙 표시용 `artworkUrl`은 다음 우선순위로 결정한다.

1. 저장된 TIDAL album artwork URL
2. 선택된 MusicBrainz release-group의 Cover Art Archive 500px front URL
3. 선택된 MusicBrainz release의 Cover Art Archive 500px front URL
4. 기존 색상 그라데이션 placeholder

이미지 URL과 출처만 저장하며 바이너리는 저장하지 않는다. `next/image`의 remote pattern에 실제 TIDAL artwork host, `coverartarchive.org`, 리디렉션 대상 이미지 host를 추가한다. 이미지 로드 실패 시 UI가 동일 카드 안에서 placeholder로 전환한다.

## 데이터 모델

기존 `001_user_tidal_connections.sql` 뒤에 `002_user_music_library.sql`을 추가한다.

### `user_playlists`

| 열 | 타입 | 의미 |
| --- | --- | --- |
| `id` | UUID PK | music-pie 내부 ID |
| `user_id` | UUID FK | 소유 사용자 |
| `tidal_playlist_id` | TEXT | TIDAL playlist ID |
| `name` | TEXT | 표시 이름 |
| `description` | TEXT NULL | 설명 |
| `tidal_artwork_url` | TEXT NULL | 플레이리스트 이미지 참조 |
| `selected` | BOOLEAN | MMS 입력 선택 여부 |
| `last_synced_at` | TIMESTAMPTZ NULL | 마지막 성공 수집 시각 |
| `created_at`, `updated_at` | TIMESTAMPTZ | 감사 시각 |

고유 키는 `(user_id, tidal_playlist_id)`다.

### `music_tracks`

| 열 | 타입 | 의미 |
| --- | --- | --- |
| `id` | UUID PK | music-pie 내부 ID |
| `user_id` | UUID FK | 소유 사용자 |
| `tidal_track_id` | TEXT | TIDAL track ID |
| `isrc` | TEXT NULL | 정규화된 ISRC |
| `title`, `artist_name`, `album_name` | TEXT | 원본 표시 메타데이터 |
| `duration_ms` | INTEGER NULL | 재생 시간 |
| `tidal_album_id` | TEXT NULL | 원본 앨범 ID |
| `tidal_artwork_url` | TEXT NULL | 원본 앨범 이미지 참조 |
| `mb_recording_id` | UUID NULL | 확정된 MusicBrainz recording |
| `mb_release_id` | UUID NULL | 확정된 MusicBrainz release |
| `mb_release_group_id` | UUID NULL | 확정된 release-group |
| `mb_status` | TEXT | `pending`, `matched`, `not_found`, `ambiguous`, `failed`, `unavailable` |
| `cover_art_url` | TEXT NULL | 선택된 Cover Art Archive 이미지 참조 |
| `created_at`, `updated_at` | TIMESTAMPTZ | 감사 시각 |

고유 키는 `(user_id, tidal_track_id)`다. ISRC가 없는 트랙은 `mb_status='unavailable'`이다.

### `user_playlist_tracks`

`playlist_id`, `track_id`, `position`, `added_at`을 저장하며 `(playlist_id, position)`을 기본 키로 사용한다. 같은 트랙이 한 플레이리스트에 여러 번 등장해도 각 위치를 보존한다. 동기화할 때 해당 플레이리스트의 한 페이지가 가진 위치 범위만 교체한다.

### `playlist_imports`

사용자별 가져오기 상태, 요청한 playlist ID 배열, `status`, 저장된 playlist/track 수, 사용자에게 노출 가능한 오류 코드, 시작·완료 시각을 저장한다. 상태는 `pending`, `running`, `paused`, `completed`, `failed_retryable`, `failed`로 제한한다. 토큰과 외부 오류 body는 저장하지 않는다.

### `musicbrainz_enrichment_jobs`

`track_id`당 하나의 작업을 두며 `status`, `attempt_count`, `next_attempt_at`, `last_error_code`를 저장한다. 여러 사용자가 같은 ISRC를 가진 경우에도 현재 단계에서는 사용자별 트랙과 작업을 유지해 삭제·격리 경계를 단순하게 한다.

### 연결 해제

기존 `tidal_connections`에 `disconnected_at TIMESTAMPTZ NULL`을 추가한다. 연결 해제 트랜잭션은 해당 사용자의 연결 행만 다음과 같이 바꾼다.

- `status='disconnected'`
- `encrypted_access_token=NULL`
- `encrypted_refresh_token=NULL`
- `access_token_expires_at=NULL`
- `scope=NULL`
- `disconnected_at=now()`

`user_playlists`, `music_tracks`, `user_playlist_tracks`, 완료된 보강 결과와 MMS 데이터는 변경하지 않는다. 아직 외부 호출을 시작하지 않은 MusicBrainz 작업은 계속 처리할 수 있으며 TIDAL 재조회가 필요한 가져오기 작업은 `paused`로 전환한다.

## 서버 API

### `GET /api/tidal/playlists`

현재 연결된 사용자의 TIDAL 플레이리스트 요약을 반환한다.

```json
{
  "playlists": [
    {
      "id": "external-id",
      "name": "Morning Focus",
      "trackCount": 38,
      "artworkUrl": "https://...",
      "saved": true
    }
  ]
}
```

연결되지 않았으면 `409 { "code": "tidal_not_connected" }`, 재인증이 필요하면 `401 { "code": "tidal_reauthentication_required" }`를 반환한다.

### `POST /api/playlists/import`

```json
{ "playlistIds": ["playlist-a", "playlist-b"] }
```

빈 배열, 중복 ID, 현재 사용자 소유가 아닌 ID를 거부한다. 성공 시 `202`와 `importId`를 반환한다. 같은 사용자가 동일 ID 집합으로 실행 중인 작업이 있으면 기존 작업을 반환한다.

### `GET /api/playlists/import/{importId}`

현재 사용자의 작업만 조회하며 `status`, playlist 수, track 수, enrichment pending 수와 오류 코드를 반환한다.

### `POST /api/musicbrainz/enrich`

현재 사용자의 pending 작업 중 처리 가능한 한 건을 보강하고 남은 개수를 반환한다. 처리할 작업이 없으면 성공 응답과 `remaining: 0`을 반환한다.

### `POST /api/tidal/disconnect`

연결 해제 트랜잭션을 수행한다. 이미 해제된 상태에서도 성공하는 멱등 API다. 응답에는 보존된 playlist/track 개수와 `status='disconnected'`를 포함한다.

## UI 흐름

1. 온보딩 진입 시 `/api/tidal/status`를 조회한다.
2. 연결 상태면 `/api/tidal/playlists`에서 실제 목록을 불러온다.
3. 사용자는 체크박스로 하나 이상 선택하고 “MMS 만들기”를 누른다.
4. UI는 가져오기 API를 시작하고 진행 상태를 polling한다.
5. TIDAL 저장이 끝나면 MMS를 열 수 있다. MusicBrainz 보강은 같은 진행 화면에서 계속되지만 추천 진입을 막지 않는다.
6. 빈 플레이리스트는 선택할 수 있지만 가져온 트랙 수가 0임을 명확히 표시한다. 모든 선택 항목이 비었으면 MMS 완료로 전환하지 않는다.
7. 계정 화면의 “TIDAL 연결 해제”는 확인 대화상자에서 “저장한 음악과 MMS는 유지되고 이후 동기화만 중단됨”을 알린다.
8. 연결 해제 후 MMS와 저장 라이브러리는 계속 열리고, 동기화 버튼만 재연결 CTA로 바뀐다.

## 오류 처리

- TIDAL 401/403: 연결을 `reauthentication_required`로 바꾸고 가져오기를 중단한다.
- TIDAL 429/5xx: 작업을 `failed_retryable`로 표시하고 사용자가 다시 시도할 수 있게 한다.
- 잘못된 TIDAL 응답: 저장하지 않은 현재 페이지만 롤백하고 `invalid_tidal_response`를 기록한다.
- MusicBrainz 404: 트랙을 `not_found`로 확정한다.
- MusicBrainz 503/네트워크 오류: 최대 5회 지수형 재시도 후 `failed`로 바꾼다.
- 이미지 404/로드 실패: 데이터 상태를 실패로 바꾸지 않고 UI placeholder를 사용한다.
- DB 쓰기 실패: 토큰이나 외부 응답 body를 로그에 넣지 않고 안정적인 오류 코드만 기록한다.

## 테스트 전략

### 단위 테스트

- TIDAL JSON:API 페이지와 `included` 관계 정규화
- cursor `links.next` 순회와 종료
- ISRC 정규화와 누락 상태
- MusicBrainz 0개·1개·복수 recording 판정
- 대표 release의 유일성 판정
- 앨범 이미지 우선순위

### repository 테스트

- 사용자 A와 B의 같은 TIDAL ID가 서로 격리됨
- 같은 사용자의 재가져오기가 중복 행을 만들지 않음
- 페이지 트랜잭션 실패가 이전 완료 페이지를 훼손하지 않음
- 연결 해제 시 토큰만 제거되고 음악 데이터가 유지됨
- 재연결 후 기존 playlist/track 행이 갱신됨
- MusicBrainz 큐 claim이 동시 요청에서 같은 작업을 두 번 반환하지 않음

### route·컴포넌트 테스트

- 익명 요청 거부
- 연결 상태별 playlist API 응답
- 소유하지 않은 playlist ID 거부
- 실제 API 목록의 선택과 import 진행 표시
- 보강 실패가 MMS 진입을 막지 않음
- 연결 해제 확인 문구와 저장 데이터 유지 상태
- 이미지 실패 placeholder

### 검증

- 관련 Vitest 파일
- 전체 `npm run test`
- `npm run lint`
- `npm run build`
- 실제 PostgreSQL에 expand migration 적용 후 두 사용자 격리 확인
- 실제 TIDAL 계정으로 playlist pagination·재가져오기·재연결 확인
- MusicBrainz 호출 간격과 `User-Agent` 확인

## 완료 기준

- 온보딩에 가짜 목록이 아니라 현재 사용자의 실제 TIDAL 플레이리스트가 표시된다.
- 선택한 플레이리스트와 전체 트랙이 사용자별로 저장된다.
- ISRC가 있는 트랙은 MusicBrainz 보강 상태와 결과를 가진다.
- 가능한 트랙은 실제 앨범 이미지를 표시하고 실패 시 placeholder를 표시한다.
- 연결 해제 후 토큰은 제거되지만 저장한 플레이리스트·트랙·보강 결과·MMS는 유지된다.
- 재연결과 재가져오기에서 중복 데이터가 생기지 않는다.
- 다른 사용자의 플레이리스트, 트랙, 가져오기 작업을 읽거나 변경할 수 없다.
