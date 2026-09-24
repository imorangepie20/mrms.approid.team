# MusicBrainz 메타데이터 자동 갱신 계획

## 목적과 현재 근거

- 운영 DB 확인 시 활성 EMS 13,742곡 중 태그 2,684곡, MusicBrainz 최초 발매일 0곡이다.
- 태그 대조는 `backfill-musicbrainz-tags` 수동 명령으로만 실행된다. 새 EMS 곡은 자동 대조되지 않는다.
- 기존 `ems-source-routines`는 core·canonical 버전을 확인하지만 derived 태그 아카이브와 녹음 최초 발매일을 처리하지 않는다.

## 설계와 완료 기준

1. 기존 MusicBrainz 서명·SHA-256 검증 경로로 해당 core 버전의 derived 아카이브를 검증한다. 검증 전에는 메타데이터를 쓰지 않는다.
2. 공식 MusicBrainz 녹음 검색 API에서 대조한 MBID의 `first-release-date`를 묶음 조회한다. 평균 초당 1회 제한보다 느리게 요청하고, 연·월·일이 모두 유효한 경우에만 `mb_first_release_date`에 저장한다.
3. active EMS 곡을 ISRC·녹음 MBID로 대조해 태그·투표 수·최초 발매일을 같은 스냅샷 기준으로 저장한다. 대조 실패와 태그 없음도 처리한 버전을 기록한다.
4. `musicbrainz_metadata` 루틴을 6시간마다 실행한다. 새 곡 또는 새 core 버전만 대조하고, 실패 시 1시간 뒤 재시도한다. 기존 수집·임베딩 작업은 유지한다.
5. 관리자 `정기 수집`에 메타데이터 루틴의 버전·최근 처리 수·오류를 표시한다. 기존 통계의 MusicBrainz 날짜 보유 수가 자동 반영된다.

## 변경 순서

1. migration: 메타데이터 루틴과 곡별 마지막 처리 버전 추가.
2. Python: 검증된 derived 다운로드, 최초 발매일 API 조회, 증분 메타데이터 대조, 루틴 예약.
3. 관리자 API·화면: 새 루틴 조작·표시.
4. 운영: migration, 기존 동일 버전 derived 아카이브 재사용, 이미지 배포, 첫 백필 및 이후 신규 곡 자동 처리 확인.

## 검증

- 로컬 Python 문법 검사, Admin/Web 빌드·lint, diff 검사. 자동 테스트는 요청되지 않아 추가·실행하지 않는다.
- 운영에서는 아카이브 서명·해시, 공식 API 응답과 요청 간격, 루틴 상태, 태그·MusicBrainz 날짜 증가, 새 곡 처리 버전, 기존 수집 진행 상태를 확인한다.
