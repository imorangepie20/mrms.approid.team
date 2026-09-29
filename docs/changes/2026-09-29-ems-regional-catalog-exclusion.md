# EMS 지역·문자권 카탈로그 제외

## 변경 이유

운영 GMS 추천 12곡 중 터키 음악 7곡과 히브리어 음악 1곡이 한 번에 노출됐다. 기존 추천은 언어·지역 제외 규칙 없이 `title | artist | album` 다국어 embedding 유사도를 크게 반영했고, 같은 컴필레이션 계열도 아티스트가 다르면 다양성 감점이 적용되지 않았다. 여기에 곡 발매일이 아니라 EMS 갱신 시각을 최근성으로 사용해 2002년·2004년 음원도 신규 음원처럼 평가되는 문제가 겹쳤다.

사용자 요청에 따라 인도·아랍·터키·히브리권 대상은 EMS에서 완전히 삭제하고, 정기 수집으로 같은 곡이 재유입되지 않도록 수집 경계도 함께 보강했다.

## 변경 내용

- `ems_catalog_exclusions`에 삭제 identity의 TIDAL ID·ISRC·제외 사유만 보관한다. 제목·아티스트·앨범·사용자 정보는 저장하지 않는다.
- EMS 승격 전에 다음 신호를 검사한다.
  - ISRC 등록 국가 `IN`, `TR`, `IL`
  - 제목·아티스트·앨범의 아랍 문자 또는 히브리 문자
  - 확인된 인도 레이블 표기: Saregama India, Sony Music Entertainment India, Tips Industries/Music, Times Music India, Warner Music India
  - 확인된 터키 레이블 표기: Bir Numara Müzik, Kalan Ses Görüntü, Moko Yapım, Seyhan Müzik
  - 기존 tombstone의 정확한 TIDAL ID 또는 ISRC
- 정책에 해당하는 신규 match는 EMS에 승격하지 않고 terminal `unavailable`로 처리한다.
- 운영 기존 대상은 tombstone을 먼저 저장한 뒤 GMS exposure·batch 참조·관련 shadow run을 정리하고 `ems_tracks`를 hard delete했다. source·availability·embedding·audio 분석 등 종속 행도 cascade 삭제했다.
- GMS 최근성 점수는 `ems_tracks.updated_at` 대신 MusicBrainz 최초 발매일, TIDAL 앨범 발매일, 일반 발매일 순으로 계산한다. 날짜가 없으면 0이며 범위는 0..1로 제한한다.
- 아랍권 국가 ISRC 전체 차단은 글로벌 배급 오탐이 확인돼 적용하지 않았다. 라틴 문자만 사용하는 트랙도 불충분한 추정으로 차단하지 않는다.
- `Je t'ai aimée`, `Süchtig`, `Heart Of A Woman`, `Ricochet`은 요청한 지역·문자권 대상이 아니므로 active로 유지했다.

## 운영 삭제 결과

- 삭제 전 active EMS: 49,155곡
- 정책 대상 hard delete: 928곡
- 삭제 후 active EMS: 48,227곡
- 생성한 최소 tombstone: 928건
- 삭제한 GMS exposure: 12건
- 정리한 추천 batch: 2건
- 삭제한 관련 shadow run: 13건
- 영향받은 현재 사용자 batch: 12곡에서 비대상 4곡으로 축소
- tombstone과 일치하는 EMS 잔존 트랙: 0건
- GMS batch의 삭제 트랙 참조: 0건
- 비대상 확인용 4곡 active: 4/4

모든 삭제는 단일 transaction에서 수행했고, 대상 928건·tombstone 928건·batch 비어짐 없음·비대상 4곡 보존을 assertion으로 확인한 뒤 commit했다. 기존 사용자 추천 결정에는 삭제 대상 기록이 없어 별도 결정 이관은 필요하지 않았다.

## 검증 결과

- EMS 전체 pytest 85개가 통과했다.
- Web 전체 142개 파일 통과·3개 skip, 테스트 554개 통과·3개 skip이다.
- ESLint 오류 0개이며 기존 경고 6개만 남았다.
- production build와 TypeScript, 52개 route 생성을 통과했다.
- migration 031을 임시 `pgvector/pgvector:pg16`에서 apply/down/reapply하고 partial unique index 3개를 확인했다.
- 정책 테스트에서 인도·터키·이스라엘 ISRC, 아랍·히브리 문자, 레이블과 exact tombstone 차단을 확인했다.
- 독일어 `Süchtig`, 프랑스어 `Je t'ai aimée`, 영어 `Heart Of A Woman`은 차단되지 않는 것을 확인했다.
- 최근성 SQL이 발매일만 사용하고 `updated_at`을 사용하지 않는 회귀 테스트를 추가했다.
- `git diff --check`를 통과했다.

## 운영 배포

- 기능 커밋 `4636ee2`를 `origin/main`에만 push했다. 기능 브랜치는 원격으로 push하지 않았다.
- release archive SHA-256은 `ac7ea1e12fb368a749b1516144d9a22b2d4f6d352144d64c0ef874057a385377`이며 Zorin release는 `/home/approid/apps/music-pie/releases/4636ee2`다.
- 삭제 전 custom-format PostgreSQL backup은 `/home/approid/apps/music-pie/shared/backups/music-pie-pre-regional-delete-4636ee2.dump`에 보관했다. 크기 223,683,336바이트, SHA-256 `882503fffca038e93e709aae4efd4d36d955b36a2ea689ba5c5705c8e097552b`이며 `pg_restore --list`로 읽기 가능성을 확인했다.
- Web image는 `sha256:6ad5ba6471fedfd28f86547acbef637527b8ddb6e6e97c377955d304443f8ec1`, EMS image는 `sha256:8ae894c17d8ddf49e696bcbe60bdc9f4d85273fcc6cfdfbb8aeec50daaa0181d`다.
- Web·EMS·source-routines는 healthy 또는 running, restart 0이며 local/public readiness는 HTTP 200이다.
- 배포 image 내부 policy probe와 최근 Web·EMS·source-routines 오류 로그 0건을 확인했다.
- 운영 전송용 tar는 서버에서 삭제했다. 로컬 임시 tar는 실행 환경의 삭제 정책이 명령을 차단해 `C:\Users\jowoo\AppData\Local\Temp\music-pie-4636ee2.tar`에 남아 있을 수 있다.

## 미검증·다음 작업

- 로그인 브라우저에서 새 batch를 실제로 재생성하지 않았다. 기존 batch의 대상 제거와 DB 정합성만 확인했다.
- 라틴 문자로 음차됐고 ISRC·레이블·기존 tombstone 신호도 없는 지역 트랙은 자동 판정하지 않는다. 실제 오탐 표본을 근거로 신호를 추가해야 한다.
- 영향받은 현재 batch의 비대상 4곡은 그대로 유지했다. 새 추천 12곡 생성은 사용자의 `다시 추천 받기` 동작에 맡긴다.
