# EMS 메타데이터·통계

## 이유

EMS에는 장르와 녹음의 정확한 발매일이 일괄 제공되지 않는다. 관리자가 실제 원천의 MusicBrainz 태그, 확인된 앨범 발매일, EMS 유입일을 구분해 보고, 이후 분석에 필요한 원천 속성을 보존해야 한다.

## 변경

- `014_ems_track_metadata.sql`, `015_ems_tag_recording.sql`로 MusicBrainz 태그·투표 수·스냅샷·태그 대조용 녹음 MBID와 MusicBrainz 최초 발매일, TIDAL 앨범 발매일 필드를 추가했다. 같은 녹음에 대응하는 여러 TIDAL 에디션이 있어 기존 `recording_mbid` 유일 제약과 태그 대조용 MBID를 분리했다.
- 새로 매칭한 TIDAL 트랙의 track·album 공개 속성, 앨범 ID, 아티스트 ID를 `ems_track_sources.metadata`에 보존한다. 유효한 앨범 `releaseDate`는 EMS 트랙에도 저장한다. 잘못된 미래 날짜는 원문에만 남기고 통계 날짜에서 제외한다.
- 기존 곡에 대해 TIDAL 상세 정보를 다시 조회하는 CLI와, MusicBrainz core의 ISRC·제목·길이로 녹음을 대조하고 derived 태그·투표 수를 저장하는 CLI를 추가했다.
- 관리자 메뉴 `/admin/ems/statistics`에 태그 상위 15개, 발매 연대, 최근 30일 유입 그래프와 각 데이터의 보유·누락 수를 표시한다. 관리자 API 인증을 적용했다.
- core 전체 원본과 derived 원본은 저장소 밖 운영 서버에 보존한다. derived 태그 출처와 CC BY-NC-SA 3.0을 화면에 표시한다.

## 운영 적용

- migration 전에 운영 DB 백업 3개를 저장소 밖에 만들고 각각 `pg_restore -l`로 읽기를 확인했다. migration 014·015를 적용했다.
- Web 및 EMS 워커 릴리스 `760ee22`를 배포했다. 누락분만 조회하도록 고친 `2688088` CLI 이미지를 빌드해 백필에 사용하고 `music-pie-ems-pipeline:current`로 지정했다. 실행 중인 워커는 재시작하지 않았다.
- 기존 TIDAL 메타데이터 백필: 7,450곡 조회, 7,450곡 갱신, 발매일 7,450건 저장. 이어 누락 42곡만 재조회해 42곡 갱신, 발매일 41건을 채웠다. TIDAL 요청 간격은 3초이며 429는 `Retry-After`를 따른다.
- MusicBrainz `20260923-002121`의 공식 derived 아카이브 518,825,123바이트를 서명 검증된 `SHA256SUMS`와 대조했다. 활성곡 8,243곡을 검사해 녹음 4,532건을 대조하고 2,684곡에 태그를 저장했다. core 전체 아카이브도 유지한다.
- 확인 시점 활성 8,525곡 중 TIDAL 앨범 발매일 8,524곡, 태그 2,684곡, 태그용 녹음 대조 4,532곡이다. 미래 발매일은 0건이다. 수집 작업은 `running / resolving`으로 계속 진행 중이었다.

## 검증

- `apps/admin`, `apps/web`의 `npm run build`: 통과.
- `apps/admin`, `apps/web`의 `npm run lint`: 오류 0. 기존 경고는 남았다.
- `python -m compileall -q services/ems-pipeline/src/ems_pipeline`, `git diff --check`: 통과.
- 운영 Compose: Web·EMS 워커·DB·임베딩 healthy, 원천 루틴 실행 중. 공개 `/admin/ems/statistics` 200, 비로그인 통계 API 401, readiness 200.
- 인앱 브라우저에서 새 메뉴와 통계 화면의 비로그인 상태를 확인했다. 관리자 로그인 후 실제 그래프 화면은 확인하지 못했다.
- 자동 테스트는 요청되지 않아 추가하거나 실행하지 않았다.

## 남은 점

- MusicBrainz 공식 dump에는 `recording_first_release_date`가 제공되지 않아 해당 필드는 비어 있다. 현재 발매 연대는 유효한 TIDAL 앨범 발매일을 사용하며, EMS `first_seen_at`과 별개로 표시한다.
- derived 태그는 상업적 이용 권한을 별도 확인해야 한다. 새 EMS 트랙의 TIDAL 메타데이터는 수집 시 저장하지만 MusicBrainz 태그 대조 CLI는 스냅샷 기준으로 다시 실행해야 한다.
