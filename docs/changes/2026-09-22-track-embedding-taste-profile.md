# 트랙 임베딩과 사용자 취향 프로필 배포

날짜: 2026-09-22

## 변경 이유

TIDAL에서 가져온 트랙의 제목·아티스트·앨범·MusicBrainz 장르를 실제 임베딩으로 변환하고, 사용자별 취향 중심과 최대 3개의 군집 중심을 재시작 가능한 작업으로 구성하기 위해 구현했다.

## 변경 내용

- 임베딩 모델: `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`
- 모델 revision: `088a2c0bb2f721158b8350700bf0f2a250df25ae`
- 출력: L2 정규화된 768차원 vector
- `services/embedding`에 비루트 FastAPI 임베딩 서비스를 추가했다.
- PostgreSQL을 pgvector 0.8.6 이미지로 전환하고 `track_embeddings`, `user_taste_profiles`, `user_taste_centroids`를 추가했다.
- 실패 재시도와 lease 회수가 가능한 트랙 임베딩 잡, 사용자 취향 중심·군집 중심 계산, 온보딩 분석 진행 상태를 구현했다.
- Web은 임베딩 서비스 장애 시에도 재생·MMS를 유지하고 분석 API만 503을 반환하도록 결합했다.
- Zorin release: `530176b`
- 서버 경로: `/home/approid/apps/music-pie/releases/530176b`
- 공개 주소와 Cloudflare Tunnel origin은 변경하지 않았다.

## 롤백 준비

- Web rollback tag: `music-pie-web:rollback-dae510c`
- PostgreSQL rollback tag: `music-pie-postgres:rollback-16.15`
- dump: `/home/approid/apps/music-pie/shared/backup/pre-embedding.dump`
- dump mode/size: `600`, 47,489 bytes
- dump SHA-256: `9f936f70bf972da6cc6d81f3ea03afde746e78496e59736f40168ae5ff081472`
- `pg_restore --list`로 dump를 검증한 뒤 DB 이미지를 전환했다.
- 기존 Web image ID: `sha256:8c161edddb7682735e595d50592f7f6636fc2ab4bce9785966c5a372c9efd7e7`
- 기존 PostgreSQL image ID: `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`

## 배포 이미지

- Web: `sha256:0151e5fc4d14dfa09c8d3190f7aca437772c417aac765cc32004c045515444f2`, runtime user `node`
- Embedding: `sha256:d88ffdfe8552aed7c14b5a8f88827d90b16e6f767d86d1f0425aee0e1af41d28`, runtime user `appuser`
- PostgreSQL: `sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`

## 검증 결과

- `apps/web`: 68개 파일, 288개 테스트 통과
- `apps/web`: ESLint와 Next.js production build·TypeScript 통과
- `services/embedding`: 4개 pytest 통과
- 로컬 Compose 구조 테스트: 3개 통과
- 로컬 Compose config와 Web·Embedding image build 통과
- Zorin Web·Embedding image build 통과
- 기존 PG16 volume을 pgvector PG16 이미지로 재기동한 뒤 migration 007 적용 통과
- pgvector extension version: `0.8.6`
- 원본 데이터 count 유지: 사용자 1, TIDAL 연결 1, 플레이리스트 3, 트랙 101, 플레이리스트 트랙 101, 가져오기 2, MusicBrainz 잡 101, rate limit 1, 좋아요 0, 아티스트 캐시 64
- `music-pie-postgres-1`, `music-pie-web-1`, `music-pie-embedding-1` health 통과
- 실제 모델 probe: 768차원, norm `1.0`, model ID·revision 일치
- local/public `/api/health/ready`, public `/onboarding`, `/mms`, `/gms`: HTTP 200
- 비로그인 `POST /api/recommendations/analyze`: HTTP 401
- 임베딩 로그에 probe 입력 문자열이 없고 Web·Embedding 최근 로그에 unhandled error가 없다.
- 배포 직후 자원 사용: PostgreSQL 26.53 MiB, Web 65.3 MiB, Embedding 919.6 MiB/3 GiB, Tunnel 19.55 MiB

## 미검증

- 로그인된 Chrome 탭 연결이 두 번 timeout되어 실제 계정의 분석 시작 UI는 자동 확인하지 못했다.
- 인증 분석을 아직 실행하지 않아 `track_embeddings` completed 0건, `user_taste_profiles` completed 0건, `user_taste_centroids` 0건이다.
- 따라서 실제 101곡 vector의 차원·norm 분포와 사용자 취향 중심·군집 중심 결과는 로그인 상태에서 분석 1회 실행 후 확인해야 한다.

## 다음 작업

1. 로그인된 공개 브라우저에서 분석을 시작하고 101개 트랙 임베딩과 사용자 취향 프로필 완료를 확인한다.
2. 완료된 취향 vector를 GMS 후보 점수화에 연결하고 추천 설명에 사용한 신호를 표시한다.
3. 이미지 용량과 콜드 스타트 시간을 계측한 뒤 필요하면 다단계 image 최적화를 별도 수행한다.
