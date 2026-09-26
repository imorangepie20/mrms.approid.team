# 관리자 공개 음악 URL 수집·검토

## 목표와 완료 기준

- 관리자가 지원 URL 하나를 입력해 작업을 만들고, 서버가 허용된 공개 소스에서 곡 메타데이터를 추출한다.
- 현재 허용 소스는 Melon 한국대중음악 장르 목록과 TIDAL 공개 트랙·앨범·플레이리스트 URL이다. 임의 호스트와 Qobuz는 거부한다.
- 입력 원본 URL, 항목별 원문 URL, 수집 시각, 제목·아티스트·앨범·재생시간·아트워크·발매일을 EMS 작업 테이블에 보존하고 관리자 화면에서 검토한다.
- 관리자가 항목을 승인하면 기존 EMS TIDAL resolver·promotion·embedding 경로에 후보로 넘긴다. 제외한 항목은 EMS 활성 카탈로그에 들어가지 않는다.
- 관리자 세션과 같은-origin 검사를 쓰고, 지원 소스 호스트를 고정해 SSRF 경계를 둔다. 외부 페이지 로그인·차단 우회는 하지 않는다.
- 기록에 작업 상태·오류 코드·후보/매칭 결과가 표시된다. 자동 테스트는 추가하거나 실행하지 않는다.

## 기존 근거

- `services/ems-pipeline/src/ems_pipeline/melon.py`의 `MelonClient`·`parse_songs`는 공개 한국대중음악 장르 페이지, 최소 3초 요청 간격, 429 대기, 50곡 페이지를 처리한다.
- `services/ems-pipeline/src/ems_pipeline/tidal.py`의 `TidalCatalogClient`, `parse_tracks`, `ResolveResult`와 `services/ems-pipeline/src/ems_pipeline/worker.py`의 `run_worker`·promotion·embedding은 승인된 후보의 기존 처리 경로다.
- `apps/web/src/lib/auth/admin.ts`는 Auth0 관리자를 서버에서 판정한다. `apps/admin/src/pages/MelonIngestion.tsx`와 EMS API는 관리 화면·API 패턴을 제공한다.
- `ems_ingest_candidates.selection_bucket`의 `user_import`, `ems_track_sources.source_type`의 `user_import`, `ems_admin_ingest_jobs`를 재사용한다.

## 변경 순서

1. `020_ems_manual_url_import.sql`: URL 작업·추출 항목 테이블과 호스트/상태/길이·건수 제약을 추가한다. 역변경 SQL을 함께 제공한다.
2. EMS Python 파이프라인: 허용 URL 파서, Melon 목록과 TIDAL 단일/앨범/플레이리스트 추출기, 최대 페이지·항목 제한, 수집 기록을 추가한다. 관리 worker가 pending URL 작업을 처리하고 승인 후보는 기존 resolver에 넘긴다.
3. Web 관리자 API: 작업 생성·목록·항목 승인/제외를 추가한다. 모든 route는 admin 가드와 origin 검사를 우선 적용한다.
4. `apps/admin`: 기존 EMS 운영 레이아웃에 URL 입력, 작업 상태, 추출 항목과 출처·수집일, 승인/제외 동작을 붙인다.
5. 변경 기록과 현재 개발 맥락에 구현·실행한 build/TypeScript/diff 결과를 반영한다. 운영 배포·DB 적용은 이 구현 범위에 포함하지 않는다.

## 제한과 확인 항목

- Melon은 기존 parser가 이해하는 공개 한국대중음악 장르 목록 URL만 받으며 URL의 pagination 범위는 서버에서 제한한다.
- TIDAL은 공개 도메인의 `/browse/{track|album|playlist}/{id}` 또는 동일 도메인의 타입 경로만 받는다. API 페이지네이션은 최대 100곡으로 제한한다.
- source URL은 표시·추적용 메타데이터다. 요청은 allowlist된 HTTPS host에서만 발생하고 리다이렉트로 도메인이 바뀌면 중단한다.
- source import 승인 뒤에도 TIDAL 지역 `STREAM`, 재생시간, 기존 후보 검증을 통과한 곡만 EMS 활성화 대상이다.
- Melon 및 TIDAL live extraction, 로그인 관리자 UI, 운영 배포 동작은 이 로컬 작업에서 확인하지 않는다.
