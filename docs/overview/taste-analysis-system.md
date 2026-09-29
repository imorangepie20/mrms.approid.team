# Music Pie 통합 취향 분석 시스템

최종 갱신: 2026-09-29

문서 상태: 현재 구현과 30초 프리뷰 오디오 분석 확정 설계

관리자 화면: `/admin/taste-analysis`

구현 계획: `docs/plans/2026-09-29-audio-preview-analysis-implementation.md`

## 1. 목적

Music Pie의 취향 분석은 사용자가 선택한 TIDAL 플레이리스트를 기준선으로 만들고, 트랙 좋아요와 GMS 추천 수락으로 선호를 강화하며, 싫어요로 이후 추천을 차단한다. 이 문서는 현재 메타데이터 기반 분석과 30초 프리뷰 오디오 분석을 하나의 추적 가능한 추천 흐름으로 정의한다.

## 2. 현재 구현된 취향 입력

| 입력 | 현재 효과 | 프로필 재계산 |
|---|---|---|
| 선택해 가져온 TIDAL 플레이리스트 트랙 | 기본 취향 입력 | 최초 분석에서 실행 |
| TIDAL 트랙 좋아요 | 해당 고유 트랙의 피드백 가중치 2배 | 추가·삭제 직후 실행 |
| GMS 추천 수락 | 해당 EMS 트랙의 피드백 가중치 2배 | 저장 직후 실행 |
| GMS 싫어요 | GMS 후보 영구 제외, 긍정 EMS 입력 제외 | 저장 직후 실행 |
| GMS 스킵 | 결정 이력만 저장 | 실행하지 않음 |
| 앨범·아티스트·플레이리스트 좋아요 | MMS 보관에만 사용 | 실행하지 않음 |
| 내부 MMS 플레이리스트 | 재생·보관에만 사용 | 실행하지 않음 |
| 재생·완청·검색·셔플·대기열 | 현재 행동 로그로 사용하지 않음 | 실행하지 않음 |

현재 싫어요는 취향 벡터를 반대 방향으로 이동시키는 음수 학습이 아니라 후보 제외가 중심이다. 이미 가져온 플레이리스트에 포함된 트랙은 기본 입력에 남을 수 있으므로 오디오 추천을 활성화하기 전에 프로필 입력과 영구 제외 규칙을 일치시킨다.

## 3. 현재 텍스트 임베딩과 취향 프로필

트랙별 입력 문자열은 다음 순서로 만든다.

```text
곡명 | 아티스트 | 앨범 | MusicBrainz 장르 또는 허용 태그 최대 3개
```

- 모델: `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`
- revision: `088a2c0bb2f721158b8350700bf0f2a250df25ae`
- 차원: 768
- 정규화: L2 norm 1
- batch: 최대 16곡
- 재계산 기준: 모델 revision 또는 정규화 입력 hash 변경

각 고유 트랙의 최종 가중치는 다음과 같다.

```text
track_weight = playlist_weight × artist_weight × feedback_weight

playlist_weight = 1 + 0.25 × min(선택 플레이리스트 소속 수 - 1, 3)
artist_weight   = 1 / sqrt(동일 아티스트 트랙 수)
feedback_weight = 좋아요 또는 GMS 수락이면 2, 아니면 1
```

- 고유 트랙 15곡 미만이면 프로필을 만들지 않는다.
- 모든 입력의 가중 평균으로 전역 중심 `cluster_index=0`을 만든다.
- 60곡 이상이면 2개와 3개 spherical K-means를 비교한다.
- 군집당 최소 10곡, silhouette 0.1 이상만 채택한다.
- 결과는 `taste-v1` 프로필과 중심 테이블에 transaction으로 교체한다.

## 4. 참고 프로젝트와 채택 결정

| 프로젝트 | 확인한 패턴 | Music Pie 결정 |
|---|---|---|
| [Essentia Music Extractor](https://github.com/MTG/essentia/blob/master/doc/sphinxdoc/streaming_extractor_music.rst) | `startTime`, `endTime`으로 첫 30초만 분석하고 frame 통계를 JSON으로 요약 | 30초 DSP 특징 추출의 기준 구현으로 채택 |
| [Essentia model catalog](https://essentia.upf.edu/models.html) | MAEST 10·20·30초 모델과 MusiCNN 기반 분위기·댄서빌리티·보컬 분류 | MAEST 30초 임베딩과 필요한 고수준 head를 1차 모델로 채택 |
| [musicnn](https://github.com/jordipons/musicnn) | 짧은 window taggram, 음악 태그와 중간 임베딩 추출 | 분위기·악기·보컬 보조 head와 결과 검증에 사용 |
| [AcousticBrainz](https://acousticbrainz.org/data) | 안정적인 low-level 측정값과 모델 의존 high-level 예측값을 별도 JSON으로 저장 | DSP feature와 model prediction을 별도 버전으로 저장 |
| [AudioMuse-AI](https://github.com/NeptuneHub/AudioMuse-AI/blob/main/docs/ALGORITHM.md) | 모델 상주, batch 제한, 임베딩·군집·유사곡·자연어 검색 분리 | bounded worker, 모델별 임베딩 공간, offline 분석 구조에 반영 |
| [LAION-CLAP](https://github.com/LAION-AI/CLAP) | 오디오와 자연어를 연결하는 별도 임베딩 공간 | 1차 경로에 넣지 않고 후속 shadow 비교 대상으로 유지 |

### 4.1 선택한 1차 스택

```text
30초 preview
  ├─ FFmpeg: 디코딩, 길이·형식 검증, mono 변환
  ├─ Essentia DSP: 10초 구간 3개와 전체 30초의 low-level feature
  ├─ MAEST 30초: 트랙 대표 audio embedding과 장르 성향
  └─ MusiCNN/Essentia heads: mood, danceability, voice/instrumental 확률
```

- DSP는 설명 가능한 수치이고 모델 교체와 독립적으로 유지한다.
- MAEST 임베딩은 프리뷰 전체 30초를 한 번 분석한다. 임의로 세 임베딩을 평균하지 않는다.
- 10초 3구간은 DSP 변화량과 MusiCNN frame prediction의 안정성을 계산하는 용도다.
- CLAP은 자연어 검색 가능성이 장점이지만 초기 추천 경로의 필수 의존성으로 두지 않는다.
- 오디오 임베딩 차원은 선택 모델의 native dimension을 그대로 저장한다. 텍스트 768차원에 맞추지 않는다.

## 5. 30초 프리뷰 분석 계약

### 5.1 입력과 전처리

- 입력 길이: 최대 30초
- hard limit: 다운로드 byte, 디코딩 시간, sample 수를 각각 제한
- DSP 분석 구간: `0~10초`, `10~20초`, `20~30초`, 전체 `0~30초`
- 모델 입력: 각 모델 metadata에 명시된 native sample rate와 channel 수
- preview identity: 원본 byte의 SHA-256과 실제 디코딩 duration
- amplitude: clipping을 만들지 않으며 모델 요구 전처리 이외의 임의 loudness normalization은 하지 않음
- 영구 저장: 원본 오디오는 저장하지 않고 hash, feature, prediction, embedding, 모델 정보와 상태만 저장

### 5.2 low-level DSP feature

| 범주 | 저장 필드 |
|---|---|
| 리듬 | `tempo_bpm`, `tempo_confidence`, `beat_strength`, `onset_density`, `rhythmic_regularness`, `percussive_ratio` |
| 에너지 | `integrated_loudness`, `rms_energy`, `peak_level`, `dynamic_range`, `crest_factor`, `energy_slope` |
| 음색 | `spectral_centroid`, `spectral_bandwidth`, `spectral_rolloff`, `spectral_flatness`, `spectral_contrast`, `mfcc` |
| 대역 | `bass_ratio`, `mid_ratio`, `high_ratio`, `harmonic_ratio`, `noise_ratio` |
| 화성 | `key`, `key_confidence`, `mode`, `chroma_distribution`, `tonal_stability`, `chord_change_rate` |

각 수치는 전체 30초 값과 세 구간의 평균·표준편차·최솟값·최댓값·변화 방향을 저장한다. 계산할 수 없는 값은 0으로 위조하지 않고 `null`과 원인 코드를 남긴다.

### 5.3 high-level prediction

- genre/style 확률
- mood: happy, sad, relaxed, aggressive, party 등 모델 label 확률
- danceability
- voice/instrumental
- acoustic/electronic
- 악기·제작 특성은 실제 채택 모델이 제공하는 label만 저장

고수준 값은 사실 필드가 아니라 `model_id`, `model_revision`, `label`, `probability`를 가진 예측값이다. `valence`, `arousal`, `tension`, `dreaminess`처럼 현재 채택 모델이 직접 제공하지 않는 값은 이름만 보고 추정해 만들지 않는다.

### 5.4 audio embedding

```text
audio_embedding = normalize(MAEST_30s(preview))
```

- `model_id`, `model_revision`, `dimensions`, `normalization`을 함께 저장한다.
- 동일 모델·revision·preview hash에서만 재사용한다.
- 서로 다른 모델의 벡터를 직접 비교하거나 평균하지 않는다.
- 모델 변경 시 기존 completed 결과를 유지하고 새 version을 별도 계산한 뒤 전환한다.

## 6. 사용자 오디오 취향 프로필

텍스트 프로필과 같은 사용자 입력·가중치를 사용하되 오디오 coverage가 있는 트랙만 별도 공간에서 집계한다.

- 전역 audio centroid 1개
- 입력 60곡 이상과 기존 품질 조건을 만족할 때 최대 3개 audio cluster
- 선호 BPM·에너지·다이내믹·대역 분포의 가중 통계
- voice/instrumental, acoustic/electronic, mood label의 가중 확률 분포
- `analyzed_track_count`, `eligible_track_count`, `coverage_ratio`
- cluster 내 분산과 cluster 간 거리

오디오 coverage가 낮다고 텍스트 프로필을 실패시키지 않는다. 텍스트 프로필과 오디오 프로필은 독립적으로 versioning하고 마지막 completed 버전만 serving한다.

## 7. 추천 파이프라인

추천은 Source → Hydrator → Filter → Scorer → Selector → SideEffect의 여섯 단계로 분리한다. 이 조합형 패턴은 xAI의 공개 [For You algorithm](https://github.com/xai-org/x-algorithm)으로 널리 알려진 구조를 참고해 Music Pie에 맞게 적용한 것이다.

| 단계 | Music Pie 역할 |
|---|---|
| Source | 활성 EMS, 텍스트 취향 중심과 가까운 후보, 에디토리얼 후보를 병렬 조회 |
| Hydrator | EMS 메타데이터, text embedding, audio analysis, 사용자 결정·노출 이력 결합 |
| Filter | 비활성·재생 불가·영구 싫어요·중복 트랙을 저비용 순서로 제거 |
| Scorer | 후보별 text, audio, mood, rhythm, catalog confidence, freshness 점수 계산 |
| Selector | final score 정렬 후 동일 아티스트 과다 노출을 완화하고 top K 선택 |
| SideEffect | 실제 제공된 후보·profile version·score components를 응답과 분리해 기록 |

### 7.1 실행 위치

- offline: 프리뷰 분석, 트랙 임베딩, 사용자 centroid와 cluster 계산
- online: 후보 hydration, 사용자별 filter, 저장된 벡터의 유사도, 최종 selector
- candidate scoring: 후보별 독립 계산을 기본으로 유지
- diversity: 후보 점수 내부의 가짜 독립값이 아니라 selector의 재정렬 단계에서 적용
- side effect: 추천 응답을 막지 않으며 실패해도 추천 결과는 반환

### 7.2 결합 점수 제안

텍스트와 오디오는 서로 다른 공간에서 cosine similarity를 계산한 뒤 결합한다.

```text
hybrid_similarity =
    text_similarity   × 0.45
  + audio_similarity  × 0.40
  + mood_similarity   × 0.10
  + rhythm_similarity × 0.05

base_score =
    hybrid_similarity  × 0.65
  + catalog_confidence × 0.15
  + freshness          × 0.10
  + editorial_priority × 0.10

final_score = diversity_selector(base_score, prior_selected)
```

이 가중치는 production 확정값이 아니라 shadow 평가용 `hybrid-v0` 제안이다. 오디오가 없으면 사용 가능한 similarity 항목만 합계 1로 재정규화하고, 나머지 catalog 계수는 유지한다. 현재 사용자 행동량에서는 예측 모델을 만들지 않고 결정적인 weighted sum을 사용한다. 향후 충분한 노출·수락·스킵·싫어요 데이터가 쌓이면 multi-action prediction 도입을 별도 결정한다.

## 8. 추천 설명 코드

- `text_taste_match`
- `audio_timbre_match`
- `rhythm_match`
- `energy_match`
- `mood_match`
- `voice_instrumental_match`
- `cluster_match`
- `novel_but_nearby`
- `artist_diversity`
- `negative_boundary_safe`
- `audio_unavailable_text_fallback`

관리자와 추천 결정 기록에는 실제 사용한 코드만 남긴다. label 확률이 낮거나 feature가 없는 경우 해당 설명을 만들지 않는다.

## 9. 데이터와 상태 모델

### 9.1 트랙 분석 상태

- identity: `track_id`, `preview_hash`, `feature_version`
- model: `model_id`, `model_revision`, `dimensions`, `normalization`
- 상태: `pending`, `running`, `completed`, `retryable`, `failed`
- lease: `claimed_at`, `lease_expires_at`, `attempt_count`
- 입력: `duration_seconds`, `sample_rate`, `segment_count`, `coverage_ratio`
- 결과: low-level feature JSONB, high-level prediction JSONB, model-native embedding
- 오류: `last_error_code`, `last_error_at`

AcousticBrainz의 패턴처럼 low-level feature와 high-level prediction의 version을 분리한다. 한쪽 모델을 교체해도 안정적인 DSP 값을 다시 계산하지 않는다.

### 9.2 사용자 오디오 프로필

- `user_id`, `profile_version`, `status`
- `embedding_model_id`, `embedding_model_revision`, `dimensions`
- `eligible_track_count`, `analyzed_track_count`, `coverage_ratio`
- 전역 중심과 최대 3개 cluster 중심
- DSP·prediction 가중 통계
- 생성에 사용한 입력 fingerprint

EMS 원본 트랙 분석은 공유할 수 있지만 개인 가중치, cluster, 결정, 추천 노출은 사용자별로 격리한다.

## 10. 처리 자원과 benchmark 원칙

30초 preview의 입력·PCM 크기는 산술적으로 계산할 수 있지만 모델 추론 시간은 실제 target hardware에서 측정하기 전 확정하지 않는다.

| 자원 | 계산값·기록 방식 |
|---|---|
| 320kbps 30초 입력 | 약 1.2MB |
| mono 16kHz float32 PCM | 약 1.83MiB |
| stereo 44.1kHz float32 PCM | 약 10.1MiB |
| embedding 저장량 | `dimensions × 4 bytes` + row overhead |
| DSP·prediction | 실제 JSONB byte와 TOAST 크기를 표본 측정 |
| CPU·GPU latency | cold/warm, p50/p95, peak RSS를 target Zorin에서 측정 |

모델은 전용 service에 상주시켜 여러 job이 공유한다. concurrency는 처리량 목표가 아니라 Zorin의 CPU·RAM·disk health gate를 기준으로 제한한다.

## 11. 실패와 fallback

- 프리뷰 없음: `audio_unavailable`로 종료하고 텍스트 점수만 사용
- 다운로드 제한 초과: `preview_too_large`
- decode 실패: `preview_decode_failed`
- 30초 미만: 실제 coverage를 기록하고 구현 계획에서 정한 최소 입력 조건으로 판정
- DSP 일부 실패: 성공 field만 저장하고 실패 field는 `null`
- 모델 응답 차원·norm 불일치: 결과를 저장하지 않고 `model_response_invalid`
- lease 만료: retryable로 회수하되 attempt 상한 적용
- 사용자 프로필 갱신 실패: 이전 completed 프로필 계속 제공
- side effect 실패: 추천 응답에는 영향 없이 재처리 대상으로 기록

## 12. 단계별 도입

1. 프리뷰 identity·다운로드·decode와 bounded job 상태를 구현한다.
2. Essentia DSP를 저장하고 관리자에서 coverage·실패 원인을 확인한다.
3. MAEST 30초 임베딩과 선택한 MusiCNN high-level head를 저장한다.
4. 사용자 오디오 프로필을 계산하되 추천에는 반영하지 않는 shadow 모드를 운영한다.
5. baseline과 hybrid의 coverage, 순위 변화, 점수 분포와 사용자 결정을 비교한다.
6. 가중치와 model version을 고정한 뒤 제한된 GMS 요청에 적용한다.
7. CLAP은 자연어 검색과 설명 가능성을 별도 shadow 실험으로 평가한다.

## 13. 현재와 제안의 경계

현재 구현된 것은 TIDAL 플레이리스트 메타데이터 임베딩, 사용자 액션 가중치, 전역·군집 중심, EMS 텍스트 유사도와 GMS 점수화다. 오디오 영역은 4MiB request cap, SHA-256 검증, FFmpeg 앞 30초 bounded decode, Essentia DSP, MAEST 2,304차원 embedding, MusiCNN prediction, EMS preview worker와 저장 schema, 관리자 coverage·오류·상세 관측까지 구현·배포했다. 운영 audio job은 completed 50·failed 1이다. 사용자 eligible 6곡을 exact-version으로 분석해 coverage 1.0, 2,304차원 global centroid의 completed audio profile을 생성했다. GMS는 동일 후보의 `hybrid-v0` component·Selector·순위 변화·coverage를 실제 페이지와 API의 `after()`에서 저장하고, 명시적 ranking setting·subject allowlist·minimum audio coverage·completed audio profile이 모두 충족될 때만 제한 serving할 수 있다. 자연 shadow는 후보 audio coverage 0%·20%·40%에서 각각 생성됐고 40% run은 overlap@K 0.5와 두 번째 cohort의 top 12 진입 6건을 기록했다. counterfactual 검토에서 부분 coverage의 available 후보 24곡 중 23곡이 text-only보다 높은 base score를 얻었으므로 partial coverage는 shadow 관찰 전용으로 한정한다. 세 번째 cohort에서는 track-specific preview 403 terminal failure가 확인돼 raw candidate 100% coverage 조건도 현재 정의로 달성할 수 없다. production hybrid 설정은 미지정이라 현재 serving은 baseline이며, 활성화 전 terminal-unavailable 후보의 taxonomy·provenance·denominator·backfill 정책과 full component coverage gate가 필요하다. activation threshold, 관찰 데이터 보관·자동 정리 정책은 아직 확정하지 않았다.
