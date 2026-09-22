# 트랙 임베딩과 최초 취향 프로필 설계

날짜: 2026-09-22

## 목표와 범위

TIDAL에서 가져온 고유 트랙 15곡 이상을 텍스트 임베딩으로 변환하고 사용자별 최초 취향 프로필을 만든다. 개발은 로컬에서 수행하고 Zorin 공개 서버는 TIDAL 메타데이터 AI 사용 범위 안의 테스트 배포로 취급한다.

이번 범위는 다음을 포함한다.

- `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` 로컬 추론 서비스
- 768차원 트랙 벡터의 버전 관리·저장·재생성
- 고유 트랙 수와 플레이리스트 중복을 반영한 사용자 취향 중심 생성
- 60곡 이상에서 최대 3개의 취향 군집 생성
- 이후 GMS가 사용할 코사인 유사도 점수 계약

EMS 후보 수집·공용 카탈로그 전환과 실제 GMS 목록 교체는 제외한다. 현재 fixture EMS에는 실제 TIDAL 재생 식별자가 없으므로 이 단계에서 가짜 추천 결과를 만들지 않는다.

## 확정 입력과 시작 조건

트랙 입력은 기존 `buildEmbeddingText` 결과를 사용한다.

```text
곡명 | 아티스트명 | 앨범명 | MusicBrainz 장르
```

장르가 없으면 공용 MusicBrainz 장르 어휘에 포함된 태그만 최대 3개 사용한다. 고유 트랙은 사용자별 `tidal_track_id` 기준으로 한 번만 임베딩한다.

- 0~14곡: 프로필 생성 안 함
- 15~59곡: 단일 취향 중심
- 60곡 이상: 조건을 만족할 때 최대 3개 취향 중심

플레이리스트 합계는 UI 예상치일 뿐이다. 서버는 중복을 제거한 `music_tracks` 개수로 시작 조건을 판정한다.

## 런타임 구조

Python FastAPI 기반 `embedding` 컨테이너를 `web`·`postgres`와 같은 비공개 backend network에 둔다. 외부 포트를 열지 않는다. Next.js만 내부 HTTP로 호출한다.

모델은 `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` revision `088a2c0bb2f721158b8350700bf0f2a250df25ae`를 이미지 빌드 때 내려받아 고정한다. 런타임 다운로드는 금지한다. 모델은 Apache-2.0이고 768차원 출력을 제공한다.

내부 API:

- `GET /health/live`: 프로세스 생존 확인
- `GET /health/ready`: 모델 로드 완료 확인
- `POST /v1/embeddings`: 최대 16개 텍스트를 받아 L2 정규화된 768차원 `float32` 벡터와 모델 revision 반환

요청에는 사용자 ID·토큰·TIDAL 자격 증명을 넣지 않는다. 모델 서비스는 입력 텍스트를 저장하거나 로그에 남기지 않는다. 추론 timeout은 30초이며 실패하면 트랙 작업을 재시도 가능 상태로 남긴다.

## PostgreSQL 저장 구조

PostgreSQL 16은 `pgvector/pgvector:0.8.6-pg16-bookworm` 계열 이미지로 교체하고 `CREATE EXTENSION vector` migration을 적용한다. 기존 volume을 그대로 사용하되 배포 전 dump와 rollback image tag를 만든다.

`track_embeddings`:

- `track_id`: `music_tracks.id` PK/FK, 트랙 삭제 시 함께 삭제
- `model_id`, `model_revision`, `input_hash`
- `status`: `pending | running | completed | failed`
- `embedding vector(768)`, 완료 전에는 `NULL`
- `attempt_count`, `last_error_code`, `updated_at`

`input_hash`는 모델 revision과 `buildEmbeddingText` 결과의 SHA-256이다. 해시가 같으면 재사용하고, 메타데이터나 모델이 바뀌면 같은 행을 `pending`으로 되돌린다.

`user_taste_profiles`는 사용자·모델·알고리즘 버전별 프로필 상태와 고유 트랙 수를 저장한다. `user_taste_centroids`는 전체 중심을 `cluster_index = 0`으로, 선택된 군집 중심을 `1..3`으로 저장한다. 각 행은 `embedding vector(768)`, 소속 트랙 수, 정규화된 가중치를 가진다. 사용자 FK에 `ON DELETE CASCADE`를 적용해 개인 프로필을 격리한다.

초기 데이터는 작으므로 pgvector의 정확 코사인 검색을 사용하고 HNSW·IVFFlat 인덱스는 만들지 않는다. 카탈로그 규모와 지연 측정이 필요성을 증명할 때만 추가한다.

## 취향 프로필 계산

각 트랙 벡터는 정규화한다. 같은 트랙이 여러 선택 플레이리스트에 있으면 다음 가중치를 쓴다.

```text
playlist_weight = 1 + 0.25 × min(playlist_count - 1, 3)
artist_weight = 1 / sqrt(max(1, 해당 아티스트의 고유 트랙 수))
track_weight = playlist_weight × artist_weight
```

아티스트별 전체 영향은 곡 수에 선형 비례하지 않고 제곱근 비율로 증가한다. 한 아티스트가 프로필을 독점하는 것을 줄이면서 반복 선택 신호는 남긴다.

전체 중심은 가중 평균 후 다시 L2 정규화한다. 60곡 이상이면 고정 seed의 spherical k-means로 `k=2`, `k=3`을 비교한다. 모든 군집이 10곡 이상이고 cosine silhouette score가 `0.10` 이상인 결과만 채택한다. 조건을 충족하지 못하면 전체 중심 하나만 유지한다.

향후 EMS 후보 점수 계약은 다음과 같다.

```text
score = 0.3 × cosine(전체 중심, 후보)
      + 0.7 × max(cosine(채택된 각 군집 중심, 후보))
```

군집이 없으면 전체 중심 코사인 유사도만 사용한다. 사용자가 이미 보유한 트랙과 영구 제외한 트랙은 점수 계산 전에 제거한다. 인기도는 취향 프로필 입력에 넣지 않는다.

## 처리 흐름과 오류 경계

1. 플레이리스트 가져오기 완료 후 누락되거나 해시가 바뀐 트랙을 `pending`으로 만든다.
2. Next.js 내부 작업 API가 최대 16개 작업을 claim하고 임베딩 서비스에 한 번에 요청한다.
3. 차원·유한값·모델 revision을 검증한 뒤 같은 transaction에서 벡터와 상태를 저장한다.
4. 모든 대상 트랙이 완료되고 고유 트랙이 15곡 이상이면 사용자 프로필을 원자적으로 교체한다.
5. 일부 트랙 실패 시 기존 프로필을 유지한다. 5회 실패한 작업은 `failed`로 남기고 오류 코드를 기록한다.

새 프로필 계산 중에는 마지막으로 완료된 프로필을 계속 제공한다. 프로필은 모든 중심 저장이 끝난 뒤 `completed`로 전환한다. 중간 결과를 GMS가 읽지 않는다.

## 검증과 완료 조건

- 모델 service contract: batch 제한, 768차원, 정규화, timeout, 입력 비로그 검증
- migration: 기존 사용자·연결·플레이리스트·101개 트랙 보존, extension과 FK rollback 확인
- 임베딩 작업: 같은 해시 재사용, 해시 변경 재생성, 사용자 격리, 실패 재시도
- 프로필: 14곡 차단, 15곡 단일 중심, 60곡 군집 조건, 고정 seed 재현성, 아티스트 편향 완화
- 로컬 전체 test·lint·build와 Docker Compose health 통과
- Zorin 테스트 배포 후 DB row count 보존, 모델 readiness, 실제 101곡 벡터 생성, 프로필 중심의 norm과 차원 확인

추천 품질 기준선은 단일 평균 프로필이다. 적응형 프로필은 이후 실제 EMS 후보가 준비되면 `NDCG@10`, `Precision@10`, 추천 수락률, 싫어요 비율로 기준선과 비교한다.

## 근거

- [모델 카드](https://huggingface.co/sentence-transformers/paraphrase-multilingual-mpnet-base-v2)
- [Sentence Transformers encode API](https://sbert.net/docs/package_reference/sentence_transformer/model.html)
- [pgvector 공식 문서](https://github.com/pgvector/pgvector)
- `docs/decisions/2026-09-20-personalized-recommendation-baseline.md`
- `docs/changes/2026-09-21-genre-embedding-input.md`
