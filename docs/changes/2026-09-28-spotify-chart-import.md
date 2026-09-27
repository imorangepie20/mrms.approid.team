# Spotify 차트 EMS 수집과 관리자 실행

## 변경 이유

- Spotify 추천 차트 section의 네 playlist를 실제 EMS 원천으로 가져오고, 관리자가 실행 상태와 예산을 확인할 수 있는 경로가 필요했다.
- Spotify 원문 항목을 그대로 재생 대상으로 간주하지 않고 TIDAL KR `STREAM` 확인을 통과한 트랙만 public EMS에 노출해야 했다.

## 구현

- 관리자 `/admin/ems/spotify`에 네 고정 대상, 시작, pause/resume, 요청 예산, 분류 집계와 playlist별 결과를 표시했다.
- 실행당 Spotify 4회, playlist당 50곡, membership 200건, TIDAL 450회, resolver 10곡 slice를 hard cap으로 적용했다.
- 공개 Spotify embed HTML은 2 MB 이하, 고정 playlist ID, 정확히 50곡, 허용된 HTTPS artwork host만 수용한다.
- 새 결과는 candidate/staging으로 저장하고 4개 playlist·200 membership·matched 1곡 이상을 검증한 completed run만 단일 transaction에서 active snapshot으로 전환한다.
- public EMS 상단에 `Spotify 차트` 네 카드와 선택한 playlist의 TIDAL 재생 가능 트랙 목록을 추가했다.
- secret, token, cookie, signed URL, 원시 검색문은 DB·응답·로그에 저장하지 않는다.

## 운영 실행 결과

- 기능 커밋 `d0632d0`을 `origin/codex/anonymous-playback-error`에 push하고 release `/home/approid/apps/music-pie/releases/d0632d0`에 배포했다.
- migration `021_ems_spotify_charts.sql` 1건을 적용했고 run `8ca016f7-dac0-4604-b18b-6b1f49f68536`을 관리자 페이지에서 실행했다.
- 최종 상태는 `completed / finished / active=true`다. Spotify 요청은 `4/4`, TIDAL 요청은 `121/450`이다.
- source membership은 4개 playlist 각각 50곡, 총 200건이며 unique resolver 후보는 110곡이다.
- 분류는 matched 91, not_found 19, ambiguous 0, unavailable 0, retryable 0, budget_exhausted 0으로 합계 110이다.
- public 전시 결과는 `인기 곡 - 글로벌 46`, `인기 곡 - 대한민국 36`, `Top 50 - 글로벌 45`, `Top 50 - 대한민국 38`곡이다.
- `(playlist_id, spotify_track_id)` duplicate는 0건이고 active snapshot은 1개다.

## 보존과 rollback

- 배포 전 dump `pre-spotify-charts-20260928-061714.dump`와 checksum을 서버 backup 경로에 보존했다.
- dump를 격리 DB에 복원해 active EMS `39,035`, 사용자 집계 `app_users,user_playlists,user_likes,user_taste_profiles = 1,5,0,1`을 확인했다.
- 배포 후 active EMS는 기존 항목 삭제 없이 `39,099`로 증가했고 사용자 집계는 `1,5,0,1`로 동일하다.
- 직전 release는 `/home/approid/apps/music-pie/releases/efdc22b`다.
- Web rollback image는 `music-pie-web:pre-spotify-charts-d0632d0` (`sha256:fbc217141322...`), EMS rollback image는 `music-pie-ems-pipeline:pre-spotify-charts-d0632d0` (`sha256:a8a84e4716c3...`)이다.
- 새 Web image는 `sha256:cc2ad3933d44...`, 새 EMS worker image는 `sha256:9243772d0834...`다. 상시 `ems-source-routines`는 기존 image·container를 유지했다.

## 검증

- pipeline 전체 pytest: 65개 통과.
- Spotify 관련 Web Vitest: 7개 파일, 28개 통과.
- 관리자 Vitest: 2개 통과. 관리자 lint는 오류 0, 기존 template 경고 39개다.
- Web·관리자 production build와 Web lint를 통과했다. Web lint는 오류 0, 기존 경고 5개다.
- Web production dependency audit는 취약점 0이다. 관리자 audit는 high/critical 0, React Router 6의 breaking major 업그레이드가 필요한 moderate 2건이 남았다.
- Web 전체 Vitest는 410개 중 407개 통과했고, 기존 Auth mock 응답 불일치 3건만 동일하게 실패했다.
- local/public readiness·Home·EMS는 HTTP 200, 비로그인 관리자 API는 401, Web·EMS worker는 healthy다.
- public EMS API는 4개 playlist와 `46,36,45,38`곡을 반환했다.
- desktop 관리자 완료 화면과 EMS 카드·목록을 확인했다. `390x844`에서 4개 카드, 네 번째 playlist 38곡 전환, 가로 overflow 0, console error 0건을 확인했다.

## 미검증 항목

- 이번 확인에서는 Spotify 차트 트랙의 실제 오디오 재생 시작과 codec별 재생은 실행하지 않았다. 재생 버튼은 기존 EMS `TrackList`와 동일한 경로를 사용한다.
- 새로 활성화된 트랙의 임베딩 backfill은 이번 수집 gate에 포함하지 않았다.
