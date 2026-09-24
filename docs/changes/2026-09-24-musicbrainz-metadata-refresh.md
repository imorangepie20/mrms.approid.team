# MusicBrainz 메타데이터 자동 갱신

## 이유

수동 `backfill-musicbrainz-tags` 실행 후 들어온 EMS 곡에는 태그가 자동으로 붙지 않았다. MusicBrainz 녹음 최초 발매일도 저장되지 않았다. 작업 시작 시 운영 DB 활성 13,742곡 중 태그 2,684곡, MusicBrainz 최초 발매일 0곡이었다.

## 변경

- 서명된 `SHA256SUMS`와 SHA-256으로 core 버전에 대응하는 derived 아카이브를 검증한다.
- 운영 core dump에는 `recording_first_release_date`가 없다. 공식 MusicBrainz 녹음 검색 API의 `first-release-date`를 MBID 50개씩 조회한다. 평균 초당 1회 제한보다 느리게 요청하고 연·월·일이 모두 유효한 경우에만 날짜로 저장한다.
- ISRC·녹음 MBID로 새 활성곡을 대조해 태그·투표 수와 최초 발매일을 저장한다. 곡별 처리 버전을 남겨 태그가 없거나 대조되지 않은 곡도 같은 스냅샷에서 반복 처리하지 않는다.
- 6시간 간격 `musicbrainz_metadata` 루틴을 기존 원천 워커에 추가한다. 관리자 `정기 수집`에서 상태, 버전, 처리 수와 오류를 확인하고 재확인을 요청할 수 있다.
- 기존 통계 화면은 새 `mb_first_release_date` 값을 자동 집계한다. 날짜가 없거나 불완전한 곡은 기존 TIDAL 발매일로 표시한다.

## 검증

- Python `compileall`: 통과.
- Admin/Web `npm run build`: 통과. Admin은 기존 큰 번들 경고, Web은 로컬 Auth0 환경 변수 경고가 있다.
- Admin/Web ESLint: 오류 0. Admin의 기존 미사용 항목 경고는 남아 있다.
- 운영 이미지 `music-pie-ems-pipeline:838bf74`, `music-pie-web:838bf74` 빌드: 통과.
- 검증된 derived 아카이브 518,825,123바이트를 core 버전 디렉터리에 복사했고 새 이미지의 서명·SHA-256 검증을 통과했다.
- 공식 녹음 검색 API에서 운영 DB의 녹음 MBID 2개를 조회해 최초 발매일 2건을 확인했다.
- 공개 `/admin/ems/routines` HTTP 200, 비로그인 원천 API HTTP 401, Web readiness HTTP 200을 확인했다.
- 자동 테스트는 요청되지 않아 추가하거나 실행하지 않았다.

## 운영 적용

- 운영 DB 백업 `/home/approid/apps/music-pie/shared/backups/musicbrainz-metadata-20260924-838bf74.dump` 65,758,182바이트를 만들고 `pg_restore -l`로 읽기를 확인했다.
- Web·EMS 이미지의 이전 `current` 태그를 `pre-metadata-20260924`로 보존했다.
- 릴리스 `838bf74`의 Web을 배포하고 migration 016 한 건을 적용했다. 새 원천 루틴 행은 6시간 간격으로 생성됐다.
- `ems-source-routines`만 새 이미지로 재생성했다. 기존 `ems-pipeline` 수집 컨테이너는 재시작하지 않았다.
- 첫 자동 실행이 `20260923-002121` 스냅샷으로 활성 14,427곡을 처리했다. 녹음 9,030곡을 대조했고 태그 3,664곡, MusicBrainz 최초 발매일 8,009곡을 저장했다. 실행 직후 활성 14,724곡 중 14,427곡에 처리 버전이 표시됐다. 태그 보유곡은 이전 2,684곡에서 3,664곡으로 늘었고 미래 366일 초과 날짜는 0건이다.
- 기존 EMS 수집 작업은 `running` 1건이며 Web과 수집 컨테이너는 healthy다. 첫 실행 중 들어온 신규곡을 확인하기 위해 메타데이터 루틴의 `next_check_at`을 현재 시각으로 당겨 두 번째 실행을 시작했다.
- 두 번째 실행은 같은 스냅샷에서 신규 323곡만 처리했다. 323곡 모두 녹음을 대조했고 태그 46곡, MusicBrainz 최초 발매일 278곡을 추가했다. 실행 직후 활성 14,862곡 중 14,750곡에 처리 버전이 기록됐고 태그 보유 3,710곡, MusicBrainz 최초 발매일 보유 8,287곡이다. 남은 112곡은 실행 도중 들어온 신규곡이다.
- 루틴은 오류 없이 `idle`로 돌아왔고 다음 확인은 `2026-09-24 09:44 UTC`(한국시간 18:44)로 예약됐다. Web과 기존 수집 컨테이너는 healthy이며 공개 readiness는 HTTP 200이다.

## 이후 작업

- 운영 유입량이 늘면 주기와 MusicBrainz API 조회량을 관찰한다. 신규곡은 다음 6시간 예약 실행에서 처리된다.
