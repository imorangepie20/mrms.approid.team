# EMS 관리자 수집 실행 화면 계획

## 목표·완료 기준

- 관리자만 `/admin/ems/ingestion`에서 EMS 수집 작업을 시작·일시정지·재개할 수 있다.
- 작업은 Web 요청 밖의 EMS 워커에서 실행되며, 재시작 후 DB 상태를 근거로 이어진다.
- 활성 트랙 수, 임베딩 완료, 후보·매칭, TIDAL 요청 수, 오류와 활성 트랙·후보 처리 추이를 같은 화면에서 확인한다.
- TIDAL 요청 사이 간격을 두고 429 `Retry-After`를 따른다. 앱의 기존 `request_budget`은 제공사 일일 한도로 해석하지 않는다.
- 곡 수 상한 없이 발견한 에디토리얼 소스를 처리한다. 소스 탐색이 끝나면 완료하며 오류는 실패 상태와 코드로 보인다.

## 변경 순서

1. `apps/web/src/lib/db/migrations/011_ems_fill_jobs.sql`: 작업 상태·조회용 샘플 저장, 동시 실행 방지. 역방향 SQL도 작성한다.
2. `apps/web/src/lib/ems/fill-jobs.ts`, 관리자 API: 인증 후 요청 생성·상태 전이·조회. 원본 TIDAL 응답과 비밀값은 Web에 저장하지 않는다.
3. `services/ems-pipeline`: 에디토리얼 플레이리스트를 순차 탐색하고 후보를 기존 resolver/승격·임베딩 경로로 처리한다. 작업마다 진행 지점을 DB에 기록한다. 429는 대기 후 재시도한다.
4. `services/ems-pipeline/Dockerfile`: 기존 Compose 서비스에서 EMS 워커를 상시 실행하도록 기본 명령을 바꾼다.
5. `apps/admin/src/pages/Ingestion.tsx`: 실행·일시정지·재개, 현황, 증가 그래프, 이력. 기존 차트 의존성을 사용한다.
6. 운영 문서와 변경 기록을 갱신한다.

## 검증

- Web/Admin 타입 검사와 빌드, Python 문법 검사, `git diff --check`.
- 배포 전 migration·서비스 시작 순서와 관리자 권한 경계를 확인한다.
- 운영 배포 시 실제 관리자 로그인, 요청 처리, 429 대응, 소스 탐색 완료와 그래프 기록을 확인한다.

## 범위

- EMS 원본 카탈로그만 추가한다. 사용자 취향·추천 제외 규칙은 변경하지 않는다.
- TIDAL 자격 증명은 기존 서버 secret에서만 읽는다. 원본 응답·토큰·DB dump는 저장소에 남기지 않는다.
