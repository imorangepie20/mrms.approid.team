# GMS 추천 그룹 커밋·푸시·운영 배포

사용자 `커푸하고 배포해` 요청에 따라 검증된 GMS 추천 그룹 UI·UX, 트랙/그룹 숨김, 좋아요 동기화와 관련 테스트·034 migration·문서 25파일을 `main`에 커밋·푸시하고 Zorin Web에 배포했다. 별도 사용자 문서 13개는 SHA-256 비교로 보존한다. 이번 배포에서는 제품 소스를 추가 수정하지 않았다.

## 완료 체크

1. PASS — 범위·품질: 기능 커밋 `d7fd609b1c2b89e294ed0d64d71db19024503dcf`, 25파일(Web 20·문서 5), 비밀값·캐시·dump 경로 0, staged diff 검사 exit 0. [직전 기능 검증](2026-10-04-gms-grouped-recommendations.md)의 Web 610개·GMS 격리 PostgreSQL 3개 통과, lint 오류 0·기존 경고 8, TypeScript·53개 page build 결과를 재사용했다. 운영 Docker build도 exit 0이며 Web source SHA 20/20이 일치한다.
2. PASS — Git: 기능 커밋 `d7fd609` push exit 0, 당시 HEAD=origin/main=remote main. 결과 문서도 별도 문서 커밋으로 push exit 0·최종 HEAD=origin/main=remote main과 기존 사용자 파일 SHA 13/13 보존을 확인했다. 자기 커밋 SHA는 문서에 포함할 수 없으므로 최종 CLI 출력과 서버 `git-final.txt`에 기록한다. 운영 image revision은 기능 커밋 `d7fd609`를 유지한다.
3. PASS — DB: custom-format 백업 298,223,660bytes, SHA-256 `151ac85bc91004cfcc9faad2cc05a1e93a5587a01acd72b55c761506f86d6a84`, `pg_restore --list` exit 0. 기존 33 migration checksum 일치·pending 034 한 건을 확인하고 `1 pending migrations applied` exit 0. 034 checksum은 `ca03b6c58905d564ff602ada1a23cfd9111647071ec69ae8dd81bb606994f24b`, 새 table 0행이다. 기존 `user_*`와 `playlist_imports` 총 14개 테이블의 count·정렬 row hash가 적용 전후·배포 후 모두 일치한다.
4. PASS — 배포: 아래 current release·revision/archive label, source 20/20, healthy·restart 0, 내부/공개 readiness 200, 비-Web container ID 6/6 동일, rollback image/release 보존과 incoming source archive 제거를 확인했다. 이전 Web에 대한 자동 rollback 경로도 준비했다. 034는 추가 table이므로 운영 rollback 시 자동 down하지 않는다.
5. PASS — 운영 접근·기록: 공개 `/gms` 200, `/gms/history` 307·`location: /gms`, 비회원 history DELETE 401. 로그인된 운영 Chrome에서 추천 4그룹·트랙 14개·개별 제거 14개·그룹 삭제 4개(빈 그룹 2개 포함)·옛 링크 0개·가로 overflow false를 확인했다. 그룹 삭제 확인은 `alertdialog`로 표시되며 취소 후 그룹 4·트랙 14·dialog 0·trigger 포커스 복귀를 확인했다. 브라우저 console error 0, Web error signature 0이다. 최종 기록·링크·diff 검사도 exit 0이다.

## 운영 증거

- release: `/home/approid/apps/music-pie/releases/20261004-gms-groups-d7fd609`
- source archive: Git 기능 커밋, 6,686,720bytes, SHA-256 `4c798cc82dddcb1ffac6bc85dec8af40fd0d9507afa92f6d1c9a5177b1e91c50`
- image: `sha256:278654ea1cb5a8da46795c4e9d98683d73afdd30acf1bfbb3aee99452a527a88`
- Web container: `2e7abaae08ba3603e91a96ca76004802be16b9705eb46d7de3e28a83803b329d`
- `org.opencontainers.image.revision`: `d7fd609b1c2b89e294ed0d64d71db19024503dcf`
- `music-pie.source-sha256`: 위 source archive digest와 일치
- backup: `/home/approid/apps/music-pie/shared/backups/20261004-gms-groups-d7fd609-before-034.dump`, 권한 600. 저장소에 넣지 않는다.
- rollback release: `20261003-editorial-variety-3cd1ea3`, image `sha256:6ee134dffcdefb93972ae65627cd7b53cb726618129a04bbc5f17c12c353a95f`, tag `music-pie-web:pre-gms-groups-20261004`
- 서버 증거: `shared/artifacts/20261004-gms-groups-d7fd609/`의 build/db/deploy/verify scripts·logs, `source.txt`, `web-sha.txt`, `backup-list.txt`, `backup-size.txt`, `backup-sha.txt`, migration 전후 기록, 개인 데이터 전후/final count·hash, 비-Web ID 비교, `rollback.txt`, `verification.txt`
- 전체 최종 재검증: `final.sh`·`final-verification.txt` exit 0, backup digest·목록 확인, migration checksum 34/34·pending 0, source·health·HTTP 경계·비-Web ID·개인 데이터·rollback·archive 정리 재확인. Git·문서 범위·사용자 파일 보존은 로컬 `audit.py`와 `git-final.txt`에 보관한다.
- 로그인 운영 screenshot: `C:/Users/jowoo/.codex/visualizations/2026/10/03/01a10410-297d-71a0-8892-edc21df8192f/gms-deploy/production.png` (52,090bytes), 저장소 밖 검증 폴더에 보관

첫 서버 실행은 Windows CRLF와 PowerShell SSH 변수 전달 오류로 build 시작 전에 실패했다. scripts를 UTF-8/LF로 저장하고 단일 인용 SSH 명령으로 수정한 뒤 build·DB·배포·운영 검증 전체를 통과했다. UI 검증에서 `dialog` locator가 맞지 않아 실제 `alertdialog`로 확인했다. 운영 데이터 수정 요청은 보내지 않았다.

## 별도 미실행·다음 작업

- 실제 운영 계정의 트랙/그룹 삭제·수락·좋아요 변경·다시 추천 받기는 개인 데이터를 변경하므로 이번 배포 검증에서 실행하지 않았다. 해당 저장/실패/동기화 동작은 로컬 컴포넌트 회귀·격리 PostgreSQL 통합으로 검증했다.
- 실제 iOS/Android·Safari/Firefox·TIDAL 재생은 실행하지 않았다. 직전 390×844 Chrome UI 검증은 통과했다.
- 기존 조건부 PostgreSQL 6개 테스트는 세 환경변수가 없어 skip됐다. 세부 이름·이유는 위 기능 검증 기록에 있다. 이번 034 격리 PostgreSQL 3개는 skip 없이 실행했다.
- 배포 후 필요 시 실사용에서 확인되는 문제를 조사한다. EMS·source-routines·audio-analysis·embedding·PostgreSQL·tunnel은 이번 작업에서 교체하지 않았다.
