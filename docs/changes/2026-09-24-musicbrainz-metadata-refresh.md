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
- 자동 테스트는 요청되지 않아 추가하거나 실행하지 않았다.

## 운영 적용과 남은 확인

- 운영 적용 전 DB 백업과 migration 016 적용 상태를 확인한다.
- 현재 보관된 `20260923-002121` core·derived 아카이브의 서명·해시와 공식 녹음 검색 API 응답을 확인한다.
- 첫 루틴 완료 후 태그·MusicBrainz 날짜 증가, 처리 버전, 기존 EMS 수집 진행 상태를 확인한다.
