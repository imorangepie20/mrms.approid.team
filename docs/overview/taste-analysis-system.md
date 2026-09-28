# Music Pie 통합 취향 분석 시스템

최종 갱신: 2026-09-29

문서 상태: 현재 구현과 30초 프리뷰 오디오 분석 확장 설계

관리자 화면: `/admin/taste-analysis`

## 1. 목적

Music Pie의 취향 분석은 사용자가 선택한 TIDAL 플레이리스트를 기준선으로 만들고, 트랙 좋아요와 GMS 추천 수락으로 선호를 강화하며, 싫어요로 이후 추천을 차단한다. 이 문서는 현재 메타데이터 기반 분석과 30초 프리뷰 오디오 분석을 하나의 추적 가능한 처리 흐름으로 정의한다.

## 2. 전체 처리 흐름

```text
TIDAL 플레이리스트 선택
  → 사용자 라이브러리 저장
  → MusicBrainz 장르·태그 보강
  → 텍스트 임베딩 생성
  → 플레이리스트·아티스트·피드백 가중치 적용
  → 전역 취향 중심과 최대 3개 군집 생성
  → EMS 후보와 텍스트 유사도 계산

30초 프리뷰 확보
  → 디코딩·정규화
  → 10초 구간 3개 분석
  → 리듬·에너지·음색·화성·보컬·악기·분위기 지표
  → 구간별 오디오 임베딩과 트랙 대표 임베딩
  → 사용자 오디오 취향 중심과 군집 생성
  → 텍스트·오디오 유사도 결합
  → GMS 최종 점수화와 설명 코드 생성
```

## 3. 현재 구현된 취향 입력

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

현재 싫어요는 취향 벡터를 반대 방향으로 이동시키는 음수 학습이 아니라 후보 제외가 중심이다. 이미 가져온 플레이리스트에 포함된 트랙은 플레이리스트 기본 입력에 남을 수 있으므로, 향후 구현에서는 프로필 입력과 후보 제외 규칙을 일치시켜야 한다.

## 4. 현재 텍스트 임베딩 입력

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

## 5. 현재 취향 가중치와 군집

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

## 6. 30초 프리뷰 분석 단위

### 6.1 전처리

- 입력 길이: 최대 30초
- 분석 구간: `0~10초`, `10~20초`, `20~30초`
- sample rate: 선택 모델의 native rate로 통일
- channel: 특징 분석은 mono, 공간 지표가 필요하면 stereo를 별도 유지
- amplitude: clipping을 만들지 않는 범위에서 정규화
- 출력: 구간 지표 3세트, 구간 임베딩 3개, 트랙 대표 임베딩 1개

### 6.2 리듬 지표

| 필드 | 설명 |
|---|---|
| `tempo_bpm`, `tempo_confidence` | 템포와 추정 신뢰도 |
| `beat_strength` | 비트의 선명도 |
| `rhythmic_regularness` | 박자 반복의 규칙성 |
| `onset_density` | 단위 시간당 음표·타격 시작 빈도 |
| `syncopation` | 엇박과 리듬 복잡도 |
| `groove_strength` | 반복 리듬의 추진력 |
| `percussive_ratio` | 타악 성분 비율 |
| `tempo_stability` | 세 구간의 템포 일관성 |

### 6.3 에너지·다이내믹 지표

| 필드 | 설명 |
|---|---|
| `integrated_loudness`, `rms_energy` | 체감 음량과 평균 에너지 |
| `peak_level`, `crest_factor` | 순간 피크와 평균 대비 피크 |
| `dynamic_range` | 큰 부분과 작은 부분의 차이 |
| `energy_variance`, `energy_slope` | 구간별 변화량과 변화 방향 |
| `transient_density` | 짧고 강한 타격음 밀도 |
| `sustain_ratio` | 지속음 비율 |

### 6.4 음색·주파수 지표

| 필드 | 설명 |
|---|---|
| `spectral_centroid` | 밝고 날카로운 정도 |
| `spectral_bandwidth`, `spectral_rolloff` | 주파수 분포 폭과 고역 경계 |
| `spectral_flatness`, `spectral_contrast` | 노이즈성과 대역별 대비 |
| `zero_crossing_rate` | 거칠고 노이즈가 많은 정도 |
| `mfcc` | 전반적인 음색 형태 |
| `bass_ratio`, `mid_ratio`, `high_ratio` | 저·중·고역 비중 |
| `harmonic_ratio`, `noise_ratio` | 화음 성분과 노이즈 성분 비율 |

### 6.5 조성·화성 지표

| 필드 | 설명 |
|---|---|
| `key`, `key_confidence`, `mode` | 조성, 신뢰도, 장·단조 경향 |
| `chroma_distribution` | 12개 음정군 분포 |
| `tonal_stability` | 조성 유지 정도 |
| `chord_change_rate` | 화음 변화 빈도 |
| `harmonic_complexity`, `dissonance` | 화성 복잡도와 긴장감 |
| `pitch_range` | 음높이 분포 범위 |

### 6.6 보컬·악기·제작 지표

- 보컬 확률, 보컬 점유율, 연주곡 확률, speechiness, 보컬 전면 배치 정도
- 피아노, 기타, 베이스, 드럼, 신시사이저, 스트링, 브라스, 목관, 오르간, 전자 비트, 오케스트라, 패드 확률
- 어쿠스틱·전자적, 라이브·스튜디오, 로파이·고선명, 건조함·리버브, 자연스러운 음량·강한 압축, 미니멀·고밀도 편곡

### 6.7 분위기 추론 지표

- `valence`: 어두움과 밝음
- `arousal`: 차분함과 활력
- `tension`: 편안함과 긴장감
- `melancholy`, `aggressiveness`, `dreaminess`, `intimacy`
- `danceability`, `focus_suitability`, `relaxation`

분위기·악기·제작 지표는 확정 사실이 아니라 모델 확률과 신뢰도로 저장한다.

## 7. 오디오 임베딩과 사용자 지표

트랙에는 구간 임베딩과 대표 임베딩을 저장한다.

```text
segment_embeddings = [segment_0, segment_1, segment_2]
audio_embedding     = normalize(weighted_mean(segment_embeddings))
segment_variance    = 세 구간 임베딩의 분산
```

사용자 단위에서는 다음을 계산한다.

- 선호 BPM 중심·범위와 리듬 복잡도
- 선호 에너지·다이내믹 범위
- 밝음·따뜻함·거침과 저·중·고역 분포
- 보컬곡·연주곡 비율과 선호 악기 분포
- 장·단조, 화성 복잡도, 긴장감
- `valence × arousal` 감정 좌표
- 어쿠스틱·전자음악, 제작 질감, 편곡 밀도
- 전역 오디오 취향 중심과 최대 3개 오디오 군집
- 군집 내 분산을 이용한 취향 일관성
- 군집 간 거리와 지표 entropy를 이용한 취향 다양성
- 후보와 가장 가까운 중심 거리로 계산한 새로운 소리 허용 범위
- 긍정 중심과 싫어요 트랙 집합 사이의 거리 경계

## 8. 텍스트·오디오 결합

두 임베딩을 같은 벡터 공간이라고 가정하지 않는다. 각 공간에서 유사도를 계산한 뒤 점수 단계에서 결합한다.

```text
hybrid_similarity =
    text_similarity   × 0.45
  + audio_similarity  × 0.40
  + mood_similarity   × 0.10
  + rhythm_similarity × 0.05

recommendation_score =
    hybrid_similarity × 0.65
  + catalog_confidence × 0.15
  + freshness          × 0.10
  + diversity          × 0.10
```

오디오가 없는 트랙은 사용 가능한 항목의 비중을 합계 1로 재정규화한다. 초기 가중치는 고정값으로 시작하되 offline 평가와 사용자별 추천 결과를 근거로 버전 관리한다.

## 9. 추천 설명 코드

관리자와 사용자 화면에서 점수 근거를 추적할 수 있도록 다음 코드 후보를 사용한다.

- `text_taste_match`
- `audio_timbre_match`
- `rhythm_match`
- `energy_match`
- `mood_match`
- `instrument_match`
- `cluster_match`
- `novel_but_nearby`
- `artist_diversity`
- `negative_boundary_safe`

## 10. 트랙당 처리 자원

30초 프리뷰, mono 16kHz float32, 10초 3구간을 기준으로 한다.

| 자원 | 예상량 |
|---|---:|
| 320kbps 입력 | 약 1.2MB |
| mono 16kHz float32 PCM | 약 1.83MiB |
| stereo 44.1kHz float32 PCM | 약 10.1MiB |
| GPU 추론 | 약 0.6~3초 |
| CPU 추론 | 약 9~43초 |
| 대표 768차원 float32 벡터 | 약 3KB |
| 구간 3개와 대표 벡터 | 약 12KB + 지표 JSON |

모델은 worker에 상주시켜 여러 트랙이 공유한다. 원본 오디오를 영구 저장하지 않고 preview hash, 분석 지표, 임베딩, 모델·revision, 완료 상태만 저장한다.

## 11. 데이터와 상태 모델 제안

### 트랙 분석

- `track_id`, `preview_hash`
- `model_id`, `model_revision`, `feature_version`
- `status`: `pending`, `running`, `completed`, `failed`
- `duration_seconds`, `sample_rate`, `segment_count`
- `features` JSONB
- `audio_embedding`
- `attempt_count`, `last_error_code`, `updated_at`

### 사용자 오디오 프로필

- `user_id`, `profile_version`, `status`
- `analyzed_track_count`, `coverage_ratio`
- 전역 오디오 중심과 최대 3개 군집 중심
- 집계 지표의 평균·표준편차·분위수
- 긍정·싫어요 경계 지표

모든 프로필과 액션은 사용자별로 격리하고, EMS 원본 트랙 분석은 공유하되 개인 가중치와 결정은 공유하지 않는다.

## 12. 처리 실패와 fallback

- 프리뷰 없음: 텍스트 점수만 사용한다.
- 프리뷰 일부만 디코딩: 성공 구간 수와 coverage를 기록하고 최소 coverage 미달이면 실패 처리한다.
- 오디오 모델 불일치: 저장하지 않고 재처리 대상으로 전환한다.
- 지표 일부 실패: 오디오 임베딩과 성공 지표만 사용하고 실패 필드를 신뢰도 0으로 둔다.
- 프로필 갱신 실패: 기존 completed 프로필을 계속 제공하고 새 버전은 공개하지 않는다.
- 추천 점수에는 실제 사용한 신호와 가중치를 `score_components`에 기록한다.

## 13. 단계별 구현 순서

1. 30초 프리뷰 수집·디코딩·hash 계약과 bounded worker를 구현한다.
2. 세 구간의 DSP 지표와 모델 임베딩을 저장한다.
3. 관리자에서 트랙별 분석 상태·지표·실패 원인을 확인한다.
4. 사용자 오디오 중심과 coverage를 계산하되 추천에는 아직 반영하지 않는 shadow 모드를 운영한다.
5. 기존 텍스트 추천과 오디오 추천의 순위 차이·coverage·분산을 평가한다.
6. 결합 점수를 버전으로 고정하고 제한된 추천에 반영한다.
7. 싫어요 입력과 기본 플레이리스트 입력의 충돌을 해소하고 회귀 검증한다.

## 14. 현재와 제안의 경계

현재 구현된 것은 TIDAL 플레이리스트 메타데이터 임베딩, 사용자 액션 가중치, 전역·군집 중심, EMS 텍스트 유사도와 GMS 점수화다. 30초 프리뷰 수집, 오디오 특징·임베딩, 사용자 오디오 프로필, 결합 점수는 이 문서의 구현 제안이며 아직 런타임과 DB에 적용하지 않았다.
