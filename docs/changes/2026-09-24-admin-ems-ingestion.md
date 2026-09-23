# EMS 관리자 수집 실행·모니터링

## 변경 이유

기존 `/admin/ems/ingestion`은 지난 실행 이력만 표시했다. 운영자가 EMS 수집을 시작·일시정지·재개하고 현재 증가량과 병목을 지속해서 확인할 수 있어야 한다.

## 변경 내용

- DB 작업·시계열 샘플과 동시 실행 방지 인덱스를 추가했다.
- 관리자 인증을 요구하는 작업 조회·시작·일시정지·재개 API를 추가했다.
- EMS 워커가 에디토리얼 플레이리스트를 순서대로 탐색하고 기존 후보 확인·승격·임베딩 경로를 사용한다. 위치와 후보 상태는 DB에 남는다.
- TIDAL 요청 간격을 두고 429 `Retry-After`를 따른다. 관리자 수집에는 4,000곡 상한이나 일일 요청 예산을 적용하지 않는다.
- 관리자 화면에 활성 트랙과 후보·매칭 추이 그래프, 작업 단계·요청 수·대기·오류·마지막 활동 시각을 추가하고 5초마다 갱신한다.

## 검증

- `npm run build` (`apps/admin`): 통과.
- `npm run build` (`apps/web`): 통과. 로컬 Auth0 환경 변수가 없어 설정 경고가 출력됐지만 빌드와 타입 검사는 완료됐다.
- 변경한 Admin/Web 파일의 ESLint: 통과.
- `python -m compileall -q services/ems-pipeline/src/ems_pipeline`: 통과.
- 로컬 Web·EMS 파이프라인 Docker image build: 통과.
- `git diff --check`: 통과.
- 자동 테스트는 요청되지 않아 실행하지 않았다.

## 미검증·다음 작업

- 운영 관리자 계정의 실제 버튼 조작, 429 발생 시 대기·재개, 장시간 수집 완료와 모든 신규 트랙의 임베딩 완료는 아직 확인하지 않았다.

## Zorin 배포·실행

- 배포 코드: `b860bff` (`codex/ems-admin-ingestion`). 기존 릴리스 `8fc6f1c`와 이전 이미지 태그를 롤백용으로 남겼다.
- 서버 저장소 밖에 migration 전 DB 백업을 만들고, `011_ems_admin_ingestion.sql` 1건을 적용했다.
- 새 Web·EMS 파이프라인 이미지를 서버에서 빌드하고 두 컨테이너를 재생성했다. Web·EMS 워커·PostgreSQL·embedding은 healthy다.
- 내부 readiness와 `/admin/ems/ingestion`은 HTTP 200, 비로그인 `/api/admin/ems/ingest-jobs`는 HTTP 401이다.
- 운영 수집 작업 `555e84ec-a83c-404b-b7aa-bf741b448b12`를 생성했다. 시작 시 active EMS 2,186곡이며, 워커가 `running / discovering`으로 전환해 TIDAL 요청 수가 증가하는 것을 확인했다.
