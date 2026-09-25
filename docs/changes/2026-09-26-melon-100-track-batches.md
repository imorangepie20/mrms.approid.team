# 멜론 100곡 묶음 자동 수집

## 이유와 변경

- 길게 이어지는 단일 목록 탐색을 최대 100곡 단위로 끊어 요청 간격과 작업 상태를 명확히 한다.
- 두 개의 50곡 목록 페이지를 읽은 뒤 TIDAL 후보를 확인한다. 현재 묶음의 미처리 후보가 없어지면 60초 대기 후 저장한 장르·페이지 위치에서 자동으로 이어간다.
- 기존 실행 중인 작업은 이미 저장한 원천곡·후보·체크포인트를 유지한다. 이전 방식에서 남은 후보를 먼저 처리하도록 migration이 열린 작업의 묶음 상태를 닫는다.
- 관리자 페이지에 현재 묶음 곡 수, 확인 대기 후보, 다음 묶음 시각을 표시한다.

## 검증과 미검증

- Python `compileall`, 관리자 `npm run build`, Web `npm run build`, EMS Docker 이미지 빌드 성공.
- 자동 테스트는 이번 요청에서 추가·실행하지 않았다.
- 운영 작업을 `genre_index=0`, `next_start_index=1651`, 발견 1,650곡에서 일시정지한 뒤 142MB PostgreSQL 백업의 `pg_restore -l` 목록을 확인했다. 백업: `/home/approid/apps/music-pie/shared/backups/pre-melon-batches-3ccc0d25f5ed.dump`.
- 운영 `019_ems_melon_batches.sql` 적용, Web·EMS·정기 수집 컨테이너를 `3ccc0d25f5ed`로 전환하고 같은 작업을 재개했다. Web readiness는 `ready`, Web·EMS 컨테이너는 healthy, 비인증 관리자 API는 HTTP 401이다.
- 재개 직후 `running|resolving`, 다음 목록 위치 1,651, 누적 발견 1,650곡, 묶음 닫힘 100곡을 확인했다. 미처리 후보 131곡이 0곡으로 줄어든 뒤 `batch_wait`와 60초 뒤 `next_batch_at`이 저장됐다. 예정 시각 뒤 자동으로 다음 100곡을 조회해 누적 발견 1,750곡, 다음 목록 위치 1,751, 현재 묶음 100곡, 상태 `running|resolving`을 확인했다.
