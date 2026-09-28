# 오디오 분석 관리자 관측과 단일 재처리

## 변경 이유

30초 preview 분석 worker와 저장 스키마를 운영에 적용했지만 전체 coverage, 실패 원인, model version 분포와 개별 결과를 한곳에서 확인할 수 없었다. 자동 대량 처리나 추천 반영 전에 운영자가 처리 범위와 오류를 확인하고, 필요한 한 건만 안전하게 재처리할 수 있는 경계가 필요했다.

## 변경 내용

- Web 관리자 API에 활성 EMS 트랙 기준 분석 상태, coverage, feature·embedding·prediction version, 오류 code 분포와 최근 처리량 집계를 추가했다.
- 트랙 목록은 검색·상태·cursor·limit을 제한하고, 상세는 job과 DSP·summary·segment·prediction을 제공한다.
- embedding은 model ID·revision·input hash·차원·정규화 metadata만 반환한다. vector 값, preview URL, signed URL과 provider token은 조회하거나 응답·로그에 남기지 않는다.
- 재처리는 활성 상태이며 numeric TIDAL ID가 있는 단일 UUID와 요청한 `essentia-dsp-v1` version으로 제한한다. 실행 중인 job은 `audio_analysis_track_busy`로 거부하고 기존 분석 결과는 삭제하지 않은 채 job만 대기 상태로 되돌린다.
- `/admin/audio-analysis`에 coverage·상태 카드, version 표, 오류 분포, 7일 처리량, 운영 benchmark, 페이지형 트랙 목록과 상세·확인형 재처리 동작을 추가했다.
- benchmark에는 Zorin에서 직접 측정한 cold `20.225초`, warm `14.039초`, peak `1.878 GiB`를 출처와 함께 표시한다.

## 완료 기준

- 집계가 활성 EMS 전체를 기준으로 missing 상태까지 포함한다.
- 목록과 상세가 bounded query이며 관리자 Auth0 allowlist 밖에서는 사용할 수 없다.
- 재처리가 단일 track/version 범위를 벗어나거나 실행 중인 job을 덮어쓰지 않는다.
- 민감한 preview 접근 정보와 embedding vector가 관리자 응답에 포함되지 않는다.
- desktop, mobile과 키보드만 사용하는 흐름에서 조회와 상세 열기가 가능하다.

## 검증 결과

- `apps/web` 전체 Vitest: 120개 파일 통과, 463개 테스트 통과, 환경 변수가 필요한 PostgreSQL 통합 파일 1개 skip.
- 임시 `pgvector/pgvector:0.8.6-pg16-bookworm` PostgreSQL에 migration 23개를 적용한 통합 테스트: 1개 통과. 집계·상세·재처리 SQL과 실행 중 conflict를 확인했다.
- `apps/admin` 전체 Vitest: 5개 파일, 12개 테스트 통과.
- Web·Admin ESLint: 오류 0. 기존 경고는 Web 5개, Admin 38개다.
- Web·Admin production build: 모두 통과. Admin bundle 크기 경고는 기존 경계와 동일하게 남아 있다.
- 운영 배포 뒤 local/public live·ready와 `/`, `/ems`, `/gms`, `/search`: HTTP 200. 비로그인 `/admin/audio-analysis`: 307, 관리자 API: 401.
- 로그인 관리자 브라우저에서 desktop과 `390x844` 레이아웃, sidebar 전환, 새로고침·검색·조회·상세의 Tab/Return 탐색을 확인했다. QA 중 재처리는 실행하지 않았다.
- 운영 DB는 active 39,102곡 중 completed 1곡, missing 39,101곡으로 집계됐다. 완료 표본은 30초·16kHz mono·2,304차원 embedding·prediction 28개다.
- 배포 후 Web 최근 10분 error·exception·fatal 로그는 0건이다. PostgreSQL·embedding·audio-analysis·EMS·source-routines·tunnel container는 재시작하지 않았다.

## 배포와 rollback

- 기능 커밋: `e1bbe73`
- Zorin release: `/home/approid/apps/music-pie/releases/e1bbe73`
- 배포 archive SHA-256: `3585147f6d01e7b8dfcdd5f231e656cab3a88fbaf8baf50b55bfc8a09667edf1`
- 새 Web image: `sha256:8b9627b8dcbbbe9a56b06be36fe7e9cd6de522e1211f77e708e09cb3cbdd62d6`
- rollback image tag: `music-pie-web:pre-e1bbe73`

## 미검증·다음 작업

- 운영 재처리 버튼은 데이터 변경을 피하기 위해 실제로 실행하지 않았다. SQL transaction과 임시 PostgreSQL 통합 테스트로 검증했다.
- 자동 schedule과 전체 39,102곡 일괄 분석은 아직 활성화하지 않았다.
- 다음 단계는 승인된 bounded sample cohort의 품질·자원·실패율을 확인한 뒤 사용자별 audio taste profile과 shadow ranking을 구현하는 것이다.
