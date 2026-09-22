# EMS 공용 카탈로그 수집·축적 설계

날짜: 2026-09-22

## 목적

EMS를 fixture 화면에서 실제 공용 트랙 카탈로그로 전환한다. MusicBrainz 공식 direct dump에서 후보를 만들고, TIDAL Catalog 검색으로 정확히 대응되는 KR 재생 가능 트랙만 순차적으로 EMS에 승격한다. 초기 목표는 10만 곡이며 이후 사용자 가져오기와 MusicBrainz 갱신을 통해 최대 50만 곡까지 축적한다.

## 합의된 전제

- MusicMoveArr torrent와 대형 TIDAL dump는 사용하지 않는다.
- MusicBrainz 공식 `fullexport`와 canonical dataset을 HTTPS로 직접 다운로드한다.
- 다운로드와 후보 선별은 여유 공간이 약 699GB인 개발 PC에서 수행하며 원본을 Zorin에 상시 보관하지 않는다.
- MusicBrainz core dump와 canonical dataset의 CC0 범위만 기본 입력으로 사용한다. `mbdump-derived`의 장르·태그는 별도 라이선스 범위가 확인되기 전에는 입력하지 않는다.
- TIDAL Catalog 검색은 사용자 토큰이 아닌 Client Credentials를 사용한다.
- TIDAL 자동 검색·필요 최소 메타데이터 저장은 사용자가 확보한 승인 use case 범위에서만 수행한다.
- 초기 활성 EMS 목표는 10만 곡, 최대치는 50만 곡이다.
- 사용자별 보관함과 행동 데이터는 공용 EMS 원본과 분리한다.
- 기존 사용자 101곡과 취향 분석 데이터는 보존한다.

## 범위

### 포함

- MusicBrainz 최신 dump URL 탐색, SHA-256·서명 확인, 재개 가능한 direct download
- core dump에서 필요한 테이블만 선택 추출
- canonical score, 연대, 아티스트 지역, 신규·롱테일을 이용한 결정적 후보 선별
- checksum과 manifest를 가진 후보 묶음
- Zorin staging import와 TIDAL 순차 resolver
- 정확 매칭, 모호 결과 격리, quota·429·재시도·checkpoint
- EMS 승격, 임베딩, 검색·페이지 이동·재생
- 사용자 가져오기에서 이미 확보한 TIDAL 트랙의 빠른 EMS 후보 등록
- GMS 개인화 후보 조회와 영구 추천 결정

### 제외

- MusicMoveArr dataset과 torrent client
- MusicBrainz 전체 mirror와 Live Data Feed
- `mbdump-edit`, `mbdump-editor`, 전체 dump의 Zorin 상시 보관
- TIDAL 검색 결과를 검증 없이 자동 채택
- 관리자 Web 화면과 행동 기반 자동 가중치 학습
- Spotify·Apple Music 재생 연동과 오디오 분석 모델

## 전체 흐름

```text
MusicBrainz LATEST
  ├─ mbdump.tar.bz2 + SHA256SUMS + signature
  └─ canonical_musicbrainz_data
              │
              ▼
개발 PC 후보 선별
  - recording/ISRC/artist/release 최소 테이블 추출
  - canonical score 60%
  - 연대·지역 다양성 30%
  - 신규·롱테일 10%
              │
              ▼
candidates.csv.gz + manifest.json + SHA256SUMS
              │
              ▼
Zorin staging → TIDAL resolver → 검증 성공 → EMS 승격
                                      │
                                      ├─ 임베딩
                                      ├─ EMS 탐색
                                      └─ GMS 추천

사용자 TIDAL 가져오기 ── 이미 확인된 TIDAL ID를 staging에 추가
```

10만 곡은 일괄 적재 수가 아니라 `TIDAL match + KR STREAM + 임베딩 완료`를 모두 만족한 활성 트랙 목표다. resolver는 1,000곡 canary로 호출량과 매칭률을 측정하고, 10,000곡 gate를 거쳐 quota 범위에서 100,000곡까지 누적한다.

## MusicBrainz 다운로드와 후보 생성

선별기는 `https://data.metabrainz.org/pub/musicbrainz/data/fullexport/LATEST`가 가리키는 immutable snapshot을 사용한다. `SHA256SUMS`와 서명을 먼저 받고 검증한 뒤 `mbdump.tar.bz2`를 재개 가능한 방식으로 다운로드한다. core dump에서 recording, isrc, artist, artist_credit, release, release_group, medium, track, area와 필요한 관계 테이블만 추출한다. `mbdump-derived`, edit history와 editor 자료는 받지 않는다.

canonical dataset의 `recording_mbid`, `release_mbid`, `artist_mbids`, `score`를 core dump의 ISRC·재생 시간·발매일·지역과 결합한다. 동일 canonical recording과 동일 ISRC 조합은 하나의 후보로 만든다.

후보 구성은 다음과 같다.

- 60%: canonical score 우선
- 30%: 연대와 아티스트 지역의 층화 표본, 미확인은 `unknown`
- 10%: 최근 발매와 낮은 score의 롱테일
- 동일 아티스트 최대 0.1%, 동일 release 최대 5곡
- 동점은 recording MBID로 정렬해 재실행 결과를 동일하게 유지

장르가 core CC0 입력에 없으면 초기 후보 선별에서 강제로 추정하지 않는다. TIDAL 매칭 후 기존 MusicBrainz 보강 경로 또는 별도 승인 데이터로 채운다.

## TIDAL 순차 resolver

resolver는 Client Credentials token으로 `countryCode=KR` TIDAL Catalog를 검색한다. 사용자별 access token이나 playlist 권한을 사용하지 않는다.

후보 query는 `artist + recording title + release title`이다. 결과는 다음 순서로 검증한다.

1. ISRC exact match
2. 정규화된 아티스트와 제목 exact match, 앨범 exact 또는 alias match
3. MusicBrainz와 TIDAL 재생 시간 차이 2초 이하
4. TIDAL availability에 `STREAM` 포함

ISRC가 같으면 제목의 괄호·공백·Unicode 차이를 허용한다. ISRC가 없으면 2~4를 모두 만족해야 한다. 서로 다른 TIDAL track ID 두 개 이상이 같은 최고 점수를 얻으면 `ambiguous`로 격리한다. 검증에 실패하면 `not_found`; 일시 오류·429·5xx는 `retryable`이다.

resolver는 후보별 query hash, attempt count, next attempt, HTTP status category, match rule과 TIDAL ID를 기록한다. `429 Retry-After`를 우선하고, 없으면 지수 backoff를 사용한다. daily request budget은 환경 설정으로 제한하며 canary에서 실제 quota를 측정한 뒤 값만 조정한다. checkpoint와 `FOR UPDATE SKIP LOCKED`로 중단 후 재개하고 여러 worker가 같은 후보를 처리하지 않게 한다.

TIDAL terms와 quota가 100,000곡 목표를 허용하지 않으면 우회하지 않고 resolver를 정지해 운영 상태에 원인을 표시한다.

## 데이터 경계

- `ems_ingest_runs`: MusicBrainz snapshot, user import와 resolver batch의 버전·checksum·count·checkpoint
- `ems_ingest_candidates`: MBID, ISRC, 후보 메타데이터, resolver 상태·오류·match rule
- `ems_tracks`: 검증된 공용 트랙과 `candidate|active|stale|inactive|rejected` 상태
- `ems_track_sources`: MusicBrainz/TIDAL 식별자, 원본 버전, 마지막 확인 시각
- `ems_track_embeddings`: 모델·revision·input hash·768차원 vector와 재시도 상태
- `ems_availability_events`: 재생 성공·불가·not-found 관찰, 사용자 식별자는 저장하지 않음
- `user_recommendation_decisions`: 사용자별 수락·영구 싫어요, 공용 EMS 원본과 분리

기존 `music_tracks`와 `track_embeddings`는 변경하지 않는다. 동일 TIDAL ID가 EMS에 있으면 취향 계산에서 공용 임베딩을 재사용할 수 있지만 사용자 플레이리스트, 위치, 좋아요와 추천 결정은 EMS 테이블에 기록하지 않는다.

## 승격과 지속 축적

TIDAL resolver가 정확 매칭과 KR STREAM을 확인한 후보만 `ems_tracks`로 승격한다. 임베딩 완료 후 공개 EMS 기본 결과에 포함한다.

- MusicBrainz snapshot 확인: 주 2회, 새 immutable version일 때만 후보 delta 생성
- TIDAL resolver: daily budget 안에서 계속 실행
- 사용자 TIDAL 가져오기: 검증된 TIDAL ID와 메타데이터를 즉시 staging
- availability: playback 실패 이벤트를 우선 처리하고 전체를 90일 rolling window로 재확인
- 분포 점검: 월 1회
- 디스크 70% 이상 또는 활성 500,000곡에서 신규 승격 중지

재생 불가 트랙은 첫 독립 관찰에서 `stale`, 7일 이후 두 번째 관찰에서도 실패하면 `inactive`, 다시 성공하면 `active`로 복구한다. hard delete하지 않는다.

## EMS 탐색과 GMS

EMS는 active, KR STREAM, 임베딩 completed인 트랙을 cursor pagination으로 50개씩 제공한다. 제목·아티스트·앨범 검색과 전체·신규·연대·지역 필터를 PostgreSQL trigram/BTREE 인덱스로 시작한다.

GMS는 EMS에서 사용자 플레이리스트, 이미 수락한 곡, 영구 싫어요와 재생 불가 트랙을 제외한다. 초기 점수는 버전 `ems-v1`로 고정한다.

```text
65% 사용자 취향 vector 유사도
15% canonical/TIDAL match confidence와 catalog priority
10% 신규성
10% 최종 목록 다양성
```

동일 아티스트 반복과 근접 중복을 재정렬에서 감점한다. 사용자 행동 데이터가 충분해질 때까지 가중치를 자동 학습하지 않는다.

## 실패·rollback·운영

- download checksum/signature 실패: 추출 전에 중단
- artifact checksum/header 실패: DB 쓰기 전에 중단
- import 중단: 5,000행 checkpoint부터 재개
- TIDAL ambiguous/not-found: 격리하고 다른 후보 계속 처리
- 429/5xx: budget을 넘지 않고 재시도
- 승격 실패: transaction rollback, staging 유지
- 임베딩 실패: 기존 EMS와 Web 유지, 해당 트랙은 비공개
- 잘못된 run: run audit로 신규 트랙 비활성화·갱신 필드 복원
- migration 실패: EMS 테이블만 내리고 기존 사용자 테이블 보존

운영 명령은 `download`, `select`, `import`, `resolve`, `promote`, `embed`, `worker`, `status`, `rollback`을 제공한다. 상태에는 최신 source version, 후보·matched·ambiguous·not-found·retryable·active·embedding count, 호출 budget, 처리량과 디스크 차단을 표시한다. 로그에는 token, query 원문, embedding input text를 남기지 않는다.

## 구현 단계

1. EMS 스키마와 repository 계약
2. MusicBrainz direct downloader·선택 추출·결정적 후보 생성
3. checksum-verified staging importer
4. TIDAL Client Credentials와 순차 resolver
5. 승격·rollback·상태·임베딩 worker
6. 사용자 가져오기 후보 등록
7. DB 기반 EMS API/UI
8. GMS 후보·영구 결정
9. 1,000곡 canary
10. 10,000곡 gate 후 100,000곡 누적 운영

## 검증과 완료 기준

### 자동 검증

- immutable source URL, checksum, signature와 재개 download
- 필요한 tar member만 추출하고 외부 경로에 쓰지 않음
- 60/30/10 후보 구성의 결정성과 cap
- 동일 snapshot·candidate import idempotency와 checkpoint 재개
- TIDAL exact/ambiguous/not-found 판정 fixture
- 429 Retry-After, token refresh, daily budget와 lease recovery
- 같은 TIDAL ID의 단일 EMS 승격
- vector dimension/norm과 모델 버전
- cursor 변조·필터 mismatch·조회 상한
- 사용자별 영구 제외와 교차 사용자 격리

### 단계 gate

- 1,000 후보 canary에서 resolver 성공률, ambiguous 비율, 호출 수와 소요 시간 측정
- 표본 수동검증 오매칭률 1% 미만일 때만 10,000 후보로 확대
- 10,000곡에서 quota 준수·p95·worker 복구·재생을 통과한 뒤 100,000 active 목표로 계속 실행
- active TIDAL ID 중복 0건
- 공개 트랙 표본 재생 가능률 99% 이상
- completed embedding dimension 768, norm `0.999..1.001`, 완료율 99% 이상
- EMS 조회 p95 300ms 이하
- 기존 사용자 101곡과 취향 데이터 row count 보존
- 동일 source snapshot 재적용 신규 candidate 0건

10만 곡 도달 예상 시간은 추정하지 않는다. 1,000곡 canary에서 측정한 공식 quota 내 처리량으로 계산해 운영 상태에 표시한다.
