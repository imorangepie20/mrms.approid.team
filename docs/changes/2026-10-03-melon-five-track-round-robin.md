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
- PASS V2: 격리 `pgvector/pgvector:pg16`에서 `MELON_TEST_DATABASE_URL=<격리 DB> python tests/integration_melon.py` — migration 001–032, 032 down/reapply, 기존 ID/누적 수/커서 보존, 실제 8장르 40후보 저장, pause rollback, 60초 대기, 기존 100곡 drain, 다중 장르 중복 제거 4개 assertion 묶음 통과.
- PASS V3: Web migration/기존 exclusions 회귀 4개 통과, migration loader 별도 재실행 2개 통과. Web lint 오류 0·기존 경고 6, build/TypeScript·52 route 통과. 관리자 lint 오류 0·기존 경고 38, Vite/TypeScript build 통과. `git diff --check` 통과. 관리자 빌드 출력은 저장소의 기존 생성물로 복구했고 Docker build에서 소스로 재생성한다.

최초 DB 검증은 Python의 기존 editable 설치가 다른 worktree를 가져오는 검증 환경 문제로 실패했다. 직접 실행하는 통합 검증에도 현재 workspace `src`를 우선 지정해 재실행했다. 관리자 검증은 로컬 dependencies 부재로 실패해 lockfile 그대로 `npm ci` 후 재실행했다. V1–V3를 다시 확인했으며 구현 실패를 개별 증상으로 우회하지 않았다.

## 운영 적용·미검증

운영 적용 결과는 배포 후 이 문서에 기록한다. 전체 장르의 모든 페이지 완료와 실제 모바일 기기 조작은 이번 검증 범위에 포함하지 않는다.
