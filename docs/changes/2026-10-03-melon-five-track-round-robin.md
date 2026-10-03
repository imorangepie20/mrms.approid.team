# 멜론 5곡 묶음·장르 순환 변경

## 원인과 변경

사용자가 100곡 단위를 5곡으로 줄이고 다른 장르도 수집되도록 요청했다. 기존 순차 수집은 첫 장르 발라드의 모든 페이지를 끝내야 다음 장르로 이동했다. 운영 원천 장르는 발라드 12,493곡뿐이었다. 추가로 running TIDAL 관리자 작업이 전체 루프를 점유해 열린 멜론 작업 `f414ab4e-f45b-4980-9866-ad09f85d95c2`는 발견 0곡인 pending 상태였다.

- 목록 조회를 `pageSize=5`로 요청하고 한 페이지를 하나의 묶음으로 처리한다. 실제 멜론 paging endpoint에서 HTTP 200·파싱 5곡을 사전 확인했다. 수동 URL 수집의 기본 50곡 조회는 유지한다.
- 매 묶음 뒤 다음 미완료 장르로 이동한다. migration 032의 `genre_checkpoints`에 장르별 다음 위치·이전 첫 곡·완료 여부를 보존한다. 기존 순차 진행 위치와 누적 수는 이관하고 이전 100곡 묶음은 후보 처리 후 이어간다.
- TIDAL 관리자 수집의 후보 처리 사이에 멜론 한 tick을 처리한다. pause·60초 묶음 대기·429 retry 시각을 존중한다. 기존 KR 검증·제외 정책·요청 간격은 변경하지 않는다.
- 저장 중 pause나 위치 변경이 감지되면 곡·장르 관계·후보·체크포인트를 함께 rollback한다. 같은 곡의 여러 장르 관계는 유지하고 후보 중복은 만들지 않는다.
- 관리자 안내는 8장르 순환·5곡 단위·다음 조회 장르로 변경했다. 이전 100곡 묶음은 처리 중임을 따로 표시한다.

## 로컬 검증

- PASS V1: `python -m pytest -q` — EMS 전체 105개 통과. 신규 멜론 14개·스케줄링 6개로 5곡 요청, 8장르 두 순환, 기존 커서, 마지막 페이지, 중복 페이지, 429·동시 TIDAL 처리 검증.
- PASS V2: 격리 `pgvector/pgvector:pg16`에서 `MELON_TEST_DATABASE_URL=<격리 DB> python tests/integration_melon.py` — migration 001–032, 032 down/reapply, 기존 ID/누적 수/커서 보존, 실제 8장르 40후보 저장, pause rollback, 60초 대기, 기존 100곡 drain, 다중 장르 중복 제거, nullable identity 조회·실제 matched 승격·연결곡 메타데이터 갱신 6개 assertion 묶음 통과.
- PASS V3: Web migration/기존 exclusions 회귀 4개 통과, migration loader 별도 재실행 2개 통과. Web lint 오류 0·기존 경고 6, build/TypeScript·52 route 통과. 관리자 lint 오류 0·기존 경고 38, Vite/TypeScript build 통과. `git diff --check` 통과. 관리자 빌드 출력은 저장소의 기존 생성물로 복구했고 Docker build에서 소스로 재생성한다.

최초 DB 검증은 Python의 기존 editable 설치가 다른 worktree를 가져오는 검증 환경 문제로 실패했다. 직접 실행하는 통합 검증에도 현재 workspace `src`를 우선 지정해 재실행했다. 관리자 검증은 로컬 dependencies 부재로 실패해 lockfile 그대로 `npm ci` 후 재실행했다. V1–V3를 다시 확인했으며 구현 실패를 개별 증상으로 우회하지 않았다.

## 첫 운영 검증과 DB 계층 수정

- 기능 `7b690b1`을 origin/main에 push하고 Web·EMS·source-routines를 `20261003-melon-7b690b1`에 적용했다. archive SHA-256 `a22c2438e8e52a67f65da29493e92a12315380c82e6059c31e5033646d1a103e`.
- backup 222,442,710바이트·SHA-256 `a32b5156a3bcff61f40070cfd2bb1e8734e9cae139a5264c1afe8e77f0a0123e`·`pg_restore --list`를 확인하고 migration 032를 적용했다. 이관 전후 전체 멜론 작업의 기존 JSON 행이 동일했다.
- V4 PASS: Web/EMS healthy·restart 0·local/public readiness 200, 나머지 서비스 ID 유지, 실행 코드/032 SQL hash 3개·image revision/archive·관리자 5곡 안내 문자열 일치.
- V5 첫 검증은 FAIL: 기존 pending 작업이 실제 5곡을 저장했으나 TIDAL 후보 중 1곡은 카탈로그 제외 조회에서 PostgreSQL `could not determine data type of parameter $1`로 lease만 남았다. 로그의 오류 SQL과 격리 DB 재현으로 DB 매개변수 추론 계층을 원인으로 확인했다.
- 해당 SQL의 nullable identity 검사와 연결된 멜론 원천의 JSON 메타데이터 갱신에 `::text`를 명시했다. 후자도 실제 matched 승격 뒤 nullable album·3장르 갱신 회귀에서 같은 오류를 재현하고 수정했다. 제외 조건·후보 lease 정책은 유지한다.
- 수정 후 V1–V3 전체를 다시 실행해 EMS 105개, DB 6개 assertion 묶음, Web 회귀 4개·lint/build, 관리자 lint/build, diff check를 통과했다. 관리자 재검증은 `npm run build -- --outDir <TEMP>/music-pie-melon-admin-check`로 생성물을 저장소 밖에 뒀다.

## 후속 운영 적용·미검증

- 후속 기능 `21f12c6`을 origin/main에 push하고 EMS·source-routines에 `20261003-melon-sql-21f12c6`을 적용했다. archive SHA-256 `027531596c36ded74b6779051d1899ae24ffd21ab8786d3a6305694ce756ee72`, EMS image `sha256:a0dc7fa89697628146172a76fb04f0871f1e1dbb382694e1ad5a9211f0924989`.
- Web 코드는 두 기능 커밋 사이에 변경이 없음을 `git diff --exit-code 7b690b1 21f12c6 -- apps/web apps/admin infra`로 확인했다. Web은 `7b690b1` image `sha256:09a698a73b6e391a527a2bda35bdde4b0166cf9ca141c85d9b7c84d2cd0994ab`를 유지했다. current release는 EMS 후속 release를 가리킨다.
- PASS V4 재검증: backup checksum 유지, 032 checksum 일치, 실행 EMS 소스 3개 hash·revision/archive 일치, Web/EMS healthy·세 서비스 restart 0, local/public readiness 200, 비-EMS 서비스 ID 전부 유지. 실제 운영 DB에서 nullable identity 조회도 성공했다. 새 EMS 시작 이후 PostgreSQL 매개변수 타입 오류 0건.
- PASS V5 재검증: 기존 작업 ID를 유지한 채 발견/후보 15곡, 현재 묶음 5곡, `GN0100`·`GN0200`·`GN0300` 다음 위치 각각 6을 확인했다. 원천 장르는 발라드 12,498곡·댄스 5곡·랩/힙합 5곡이며 다음 조회 장르는 R&B/Soul이다. 첫 5곡 묶음의 미처리 후보는 0개다. 이전 워커가 남긴 이후 후보 lease는 기존 만료·재시도 규칙으로 처리하며 임의 초기화하지 않았다.
- 운영 재검증 스크립트와 결과는 `/home/approid/apps/music-pie/shared/artifacts/20261003-melon-sql-21f12c6/verify.sh`·`verification.txt`, 원본 배포/backup/이관 비교는 `shared/artifacts/20261003-melon-7b690b1/`에 남겼다. 이전 image·release와 backup은 rollback용으로 보존한다.

필수 V1–V5는 모두 PASS다. 전체 8장르의 모든 페이지 완료는 장시간 수집이므로 끝까지 기다리지 않았고, 실제 모바일 기기는 사용할 수 없어 확인하지 않았다. 8장르 순환은 회귀/격리 DB로, 운영의 다른 장르 저장은 댄스·랩/힙합으로 확인했다. 다음 작업은 관리자 화면에서 이후 장르와 재시도 후보의 진행을 관찰하는 것이다.

## 후속 운영 연속 검증 — 2026-10-03 11:51 KST

사용자 `다음` 요청에 따라 기존 작업을 관찰하고 최초 8장르 순환과 두 번째 발라드 묶음까지 확인했다. 작업 상태나 후보 lease를 임의 변경하지 않았다.

- PASS F1: Web `7b690b1`, EMS/source-routines `21f12c6` revision 유지, Web/EMS healthy·세 서비스 restart 0·local/public readiness HTTP 200. `followup.sh`가 매 조회마다 assertion으로 확인했다.
- PASS F2: 11:51:53 KST DB snapshot에서 발견 45곡·후보 41곡·현재 묶음 5곡이다. 발라드 원천은 12,503곡, 댄스·랩/힙합·R&B/Soul·인디음악·록/메탈·트로트·포크/블루스는 각각 5곡이다. 8장르 첫 5곡 뒤 체크포인트가 모두 6에 도달했고 발라드 두 번째 묶음 뒤 `GN0100.nextStartIndex=11`로 전진했다. 다음은 댄스 위치 6이다.
- PASS F3: 이전 lease가 남았던 첫 15후보의 미처리 0건, matched 8곡의 active EMS·멜론 출처·KR STREAM 연결 누락 0건, 새 EMS 시작 이후 DB/워커 오류 각각 0건을 확인했다. 당시 후보는 matched 8·not_found 29·ambiguous 2·pending 1·resolving 1이며 마지막 두 건은 새 발라드 묶음의 정상 처리 중이다. 첫 40곡 묶음의 후보 36곡은 앞선 11:50:16 조회에서 모두 terminal 상태였다.

증거 스크립트와 snapshot은 `/home/approid/apps/music-pie/shared/artifacts/20261003-melon-sql-21f12c6/followup.sh`·`followup-verification.txt`다. 후속 F1–F3를 모두 재실행해 PASS를 확인했다. 코드 변경은 없으며 문서 diff와 참조 경로를 확인한다.

미검증: 전체 카탈로그의 모든 페이지 완료는 수집이 계속 진행 중이므로 확인하지 않았다. 실제 모바일 기기 조작은 이 서버 상태 점검의 범위 밖이다.
