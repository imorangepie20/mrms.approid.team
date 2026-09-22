# EMS 공용 카탈로그 수집·축적 설계

날짜: 2026-09-22

## 목적

EMS를 네 곡의 fixture 화면에서 실제 공용 트랙 카탈로그로 전환한다. 초기에는 MusicMoveArr Datasets에서 선별한 TIDAL 트랙 10만 곡을 적재하고, 이후 upstream 증분과 사용자가 가져온 신규 TIDAL 트랙을 계속 축적한다. GMS는 이 공용 카탈로그에서 사용자별 추천 후보를 선택한다.

## 합의된 전제

- 사용자는 MusicMoveArr Datasets를 서비스 DB에 복제·가공해 사용할 라이선스를 확보했다.
- 초기 활성 EMS 규모는 10만 곡이며 최대 50만 곡까지 단계적으로 확장한다.
- 초기 구성은 인기도 60%, 장르·연대·국가 다양성 30%, 신규·롱테일 10%다.
- 대형 원본은 Zorin 홈서버에 상시 보관하지 않는다. 개발 PC에서 선별하고 작은 배포 묶음만 서버로 전달한다.
- 사용자별 보관함과 행동 데이터는 공용 EMS 원본에 섞지 않는다.
- 기존 사용자 데이터와 취향 분석 기능을 보존한다.

## 범위

### 포함

- EMS 전용 스키마와 migration
- 대형 원본을 읽어 10만 곡을 결정적으로 선별하는 오프라인 export 도구
- checksum과 manifest를 가진 압축 배포 묶음
- 서버 staging import, 검증, 중복 제거, 승격, rollback
- EMS 전용 MusicBrainz 메타데이터와 임베딩 작업
- DB 기반 EMS 목록·검색·필터·페이지 이동
- 사용자 가져오기에서 발견한 신규 트랙의 EMS 후보 등록
- upstream 증분 반영과 운영 상태 확인 명령
- GMS 후보 조회를 위한 EMS 임베딩 인터페이스

### 제외

- MusicMoveArr 전체 원본의 홈서버 상시 보관
- 초기 10만 곡 전체에 대한 실시간 MusicBrainz API 조회
- 관리자 Web 화면과 관리자 권한 체계
- 행동 데이터로 추천 가중치를 자동 학습하는 기능
- Spotify·Apple Music 재생 연동
- 오디오 자체 분석 모델

## 아키텍처

```text
MusicMoveArr snapshot/increment
          │
          ▼
개발 PC 선별기
  - 필수 조건 검사
  - 중복 제거
  - 균형 표본 추출
  - MusicBrainz/ISRC 결합
          │
          ▼
CSV.gz + manifest.json + SHA-256
          │
          ▼
Zorin staging ── 검증/격리 ── EMS 승격
                                │
                                ├─ 임베딩 queue
                                ├─ EMS 탐색 API/UI
                                └─ GMS 후보 조회

사용자 TIDAL 가져오기 ── 신규 ID만 staging 후보로 추가
```

개발 PC의 선별기는 외부 원본 형식을 내부 import 계약으로 변환한다. 서버는 외부 원본의 테이블 구조를 알지 않으며 manifest와 CSV 계약만 처리한다. 이 경계로 upstream 형식 변경이 production 스키마에 직접 전파되지 않게 한다.

## 데이터 경계와 스키마

기존 `music_tracks`와 `track_embeddings`는 사용자별 데이터이므로 변경하지 않는다. EMS는 별도 공용 테이블을 사용한다.

### `ems_tracks`

- 내부 UUID primary key
- 정규화된 제목, 아티스트, 앨범, 재생 시간, artwork
- ISRC와 TIDAL popularity
- MusicBrainz ID, 장르, 태그
- `candidate`, `active`, `stale`, `inactive`, `rejected` 상태
- 최초 수집, 마지막 확인, 활성화 시각
- TIDAL ID는 활성·후보 전체에서 유일하다.

### `ems_track_sources`

- `ems_track_id`
- provider와 provider track ID
- 원본 dataset version과 ingest run
- 국가별 availability와 마지막 확인 시각
- TIDAL을 우선 구현하되 provider 컬럼은 이후 소스를 수용한다.

### `ems_ingest_runs`

- `snapshot`, `increment`, `user_import` 유형
- manifest ID, checksum, 원본 버전
- `pending`, `staging`, `validating`, `promoting`, `completed`, `failed`, `rolled_back` 상태
- 읽은 행, 신규, 갱신, 제외, 실패, 승격 건수와 checkpoint
- 동일 manifest ID와 checksum의 중복 적용을 막는다.

### `ems_ingest_candidates`

- ingest run에 속한 정규화 전후 필드
- 검증 상태와 `rejection_reason`
- TIDAL ID, ISRC, 제목·아티스트·앨범 정규화 키
- staging 자료는 해당 run의 감사·rollback 기간 동안 유지한다.

### `ems_track_embeddings`

- `ems_track_id` primary key
- model ID, revision, input hash와 input text
- `pending`, `running`, `completed`, `failed` 상태
- 768차원 vector, 시도 횟수, 오류 코드와 갱신 시각
- 기존 사용자 트랙 임베딩과 같은 모델 계약과 재시도 규칙을 사용한다.

사용자 `music_tracks.tidal_track_id`와 EMS source의 TIDAL ID가 같으면 추천·취향 계산에서 EMS 임베딩을 재사용할 수 있다. 사용자 소유 관계, 플레이리스트 위치, 좋아요와 추천 결정은 EMS 테이블에 기록하지 않는다.

## 초기 10만 곡 선별

### 필수 조건

- 유효한 TIDAL track ID
- KR에서 `STREAM` 가능
- 제목·아티스트·앨범 존재
- 재생 시간 30초 이상
- 손상되지 않은 정상 메타데이터
- 동일 TIDAL ID 중복 아님

ISRC가 없으면 TIDAL ID로 유지할 수 있지만 다양성·MusicBrainz 결합 점수에서는 불리하게 취급한다. 중복 판정은 TIDAL ID를 우선하고, 보조 판정은 `ISRC + 정규화 제목 + 정규화 아티스트`를 사용한다.

### 구성

- 60,000곡: TIDAL popularity 상위
- 30,000곡: MusicBrainz에서 확인된 장르·연대·아티스트 지역별 층화 표본. 지역 미확인 트랙은 별도 `unknown` 층으로 취급한다.
- 10,000곡: 신규 발매와 롱테일
- 동일 아티스트는 전체의 최대 0.1%
- 동일 앨범은 최대 5곡
- 동점은 TIDAL ID로 정렬해 같은 입력에서 같은 결과를 만든다.

선별 결과는 원본 버전, 필터 버전, seed, 입력·출력 count와 SHA-256을 manifest에 기록한다.

## 적재와 승격

1. 선별기가 `tracks.csv.gz`, `sources.csv.gz`, `manifest.json`, checksum 파일을 생성한다.
2. 서버 import 명령이 manifest와 checksum을 먼저 검증한다.
3. PostgreSQL `COPY`로 해당 ingest run의 staging에 적재한다.
4. 행 단위 검증과 중복 판정을 수행한다.
5. 잘못된 행은 `rejection_reason`과 함께 격리하고 정상 행 처리는 계속한다.
6. 하나의 승격 transaction에서 `ems_tracks`와 source를 upsert한다.
7. 새 입력 또는 임베딩 입력이 달라진 트랙만 임베딩 `pending`으로 만든다.
8. 임베딩 완료 트랙만 공개 EMS의 기본 결과에 포함한다.

같은 manifest를 다시 적용하면 신규 행이 생기지 않아야 한다. 중단된 run은 checkpoint부터 재개한다.

## 지속 축적과 운영 주기

- 사용자 TIDAL 가져오기: 신규 TIDAL ID를 `user_import` 후보로 즉시 등록
- 매일 새벽: 후보 검증, 중복 제거, EMS 승격
- 임베딩: 서버 자원 제한 안에서 지속 처리, 최대 5회 재시도
- 주 1회: playback 실패 트랙과 분할된 검증 표본을 우선 확인한다. 전체 카탈로그는 rate limit을 지키며 90일 안에 한 번 이상 순환 확인한다.
- upstream 증분 공개 시: 개발 PC에서 내부 import 묶음으로 변환해 적용
- 월 1회: 인기도, 장르·연대·국가 분포와 아티스트 편중 재계산
- 활성 EMS는 10만 곡에서 시작해 최대 50만 곡까지 확장
- 디스크 사용률 70% 이상이면 신규 승격과 대형 import를 중지하고 상태 명령에 경고

upstream에서 사라지거나 재생 불가가 된 트랙은 즉시 삭제하지 않는다. 첫 확인에서 `stale`, 다음 독립 확인에서도 복구되지 않으면 `inactive`로 전환한다. 감사 이력과 사용자별 결정 참조는 유지한다.

## EMS 탐색

EMS 화면은 fixture import를 제거하고 서버 API를 사용한다.

- 기본 page size 50
- cursor pagination
- 제목·아티스트·앨범 검색
- 전체·인기도·신규·장르 필터
- 활성이고 임베딩이 완료된 트랙만 기본 노출
- TIDAL 재생 식별자를 포함해 공통 `TrackList`에서 실제 재생
- 안정적인 정렬 키를 사용해 페이지 사이 중복·누락을 방지

검색 인덱스는 PostgreSQL의 정규화 검색 컬럼과 trigram/BTREE 인덱스로 시작한다. 50만 곡에서 실측 지연이 목표를 넘기기 전에는 별도 검색 엔진을 도입하지 않는다.

## GMS 후보 점수

GMS는 EMS의 활성·임베딩 완료 트랙 중 다음 항목을 제외한다.

- 사용자가 영구 `싫어요`로 결정한 트랙
- 이미 추천 수락한 트랙
- 사용자 플레이리스트에 있는 트랙
- 현재 재생 불가 상태인 트랙

초기 점수는 다음 고정 버전으로 관리한다.

```text
65% 사용자 취향 중심과의 vector 유사도
15% 정규화된 TIDAL popularity
10% 신규성
10% 최종 목록의 다양성 재정렬
```

취향 중심이 여러 개면 가장 가까운 중심의 유사도와 중심 weight를 함께 사용한다. 동일 아티스트 반복과 지나치게 유사한 곡은 최종 재정렬에서 감점한다. 충분한 행동 데이터가 쌓이기 전에는 가중치를 자동 학습하지 않는다.

## 품질 지표

### 카탈로그

- 공개 트랙 재생 가능률
- 임베딩 완료율과 실패율
- 중복 TIDAL ID와 중복 ISRC 비율
- 장르·아티스트·연대·국가 편중도
- 신규 후보의 승격·격리 비율
- ingest 및 embedding 처리량

### 추천

- 추천 수락률과 싫어요율
- 스킵률과 완청률
- 추천 목록 내부 다양성
- 사용자 보관함과의 novelty
- 영구 제외 재노출 0건

지표는 사용자 간 원시 행동을 섞어 개인 취향 모델을 만들지 않는다. 집계 운영 지표와 사용자별 취향 갱신 근거를 구분한다.

## 실패와 rollback

- checksum 불일치: staging 전에 중단
- 일부 행 오류: 행을 격리하고 정상 행 계속 처리
- DB 오류: 승격 transaction rollback, staging과 checkpoint 유지
- 임베딩 장애: 트랙 `pending` 유지, EMS의 기존 활성 트랙은 계속 제공
- 잘못된 batch: 해당 ingest run에서 신규 생성한 트랙을 비활성화하고 이전 값으로 갱신된 행은 run audit 값으로 복원
- migration 실패: 새 EMS 테이블만 내리는 down migration 제공, 기존 사용자 테이블은 변경하지 않음

production 적용 전 현재 DB dump와 image tag를 생성하고 복원 가능성을 확인한다.

## 운영 명령

- `ems:import`: manifest와 CSV 묶음을 staging에 적재
- `ems:promote`: 검증 완료 후보를 승격
- `ems:embed`: 대기 중인 EMS 임베딩 처리
- `ems:status`: 마지막 run, 상태별 count, 처리량, 실패, 디스크 차단 상태 표시
- `ems:rollback`: 지정 ingest run을 비활성화·복원

관리자 Web 화면은 권한 모델이 정의될 때까지 만들지 않는다.

## 구현 단계

1. EMS 스키마, 저장소와 import 계약
2. 결정적 오프라인 선별기와 100곡 fixture 검증
3. 실제 dataset 1,000곡 canary import와 rollback
4. EMS 임베딩 worker와 상태 명령
5. DB 기반 EMS API/UI와 실제 TIDAL 재생
6. 10만 곡 production import
7. 사용자 가져오기 후보 등록과 upstream 증분 적용
8. GMS 후보 검색·점수화와 운영 지표

각 단계는 독립 commit과 검증 gate를 가지며, 1,000곡 canary 결과를 확인하기 전에는 10만 곡을 production에 넣지 않는다.

## 검증과 완료 기준

### 자동 검증

- migration up/down과 기존 사용자 row 보존
- 선별 결과의 결정성, 구성 비율, 아티스트·앨범 상한
- TIDAL ID·ISRC 중복 판정
- invalid row 격리와 reason 기록
- 같은 manifest 재적용의 idempotency
- checkpoint 재개와 ingest run rollback
- 임베딩 재시도와 모델 version 변경 시 재생성
- EMS cursor pagination의 중복·누락 방지
- 사용자별 영구 제외와 기존 보관함 제외

### 실서버 검증

- 실제 dataset 1,000곡 canary 성공
- 활성 EMS 100,000곡
- 중복 TIDAL ID 0건
- 공개 트랙 재생 가능률 99% 이상
- 임베딩 완료율 99% 이상
- EMS 목록 조회 p95 300ms 이하
- 동일 manifest 재적용 시 신규 행 0건
- 중간 중단 후 checkpoint 재개 성공
- batch rollback 후 이전 활성 count 복원
- 기존 사용자 트랙 101곡과 취향 분석 데이터 보존

## 미정이 아닌 후속 결정

- 초기 구현은 PostgreSQL 검색으로 충분한지 실측한다. 목표를 넘을 때만 별도 검색 엔진을 검토한다.
- 초기 임베딩 처리 완료 시간은 1,000곡 canary에서 측정한 실제 throughput으로 산정한다.
- 관리자 Web 화면은 관리자 인증·권한 설계가 별도로 승인된 뒤 진행한다.
