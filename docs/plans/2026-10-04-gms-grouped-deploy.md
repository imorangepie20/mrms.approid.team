# GMS 추천 그룹 커밋·푸시·운영 배포 계획

## 범위·순서

사용자 `커푸하고 배포해` 요청으로 이번 GMS 추천 그룹 변경과 관련 테스트·migration·문서만 main에 커밋하고 origin/main에 일반 push한다. 기존 사용자 작업인 `docs/harness/skill-plugin-environment.md`와 포트폴리오·이력서·hindsight 문서는 포함하지 않는다. 최초 HEAD·remote main은 `692a442f352676538919c32be8cfab3fb6a397b5`로 일치한다.

제품 소스를 바꾸지 않으므로 직전 전체 Web 610개·GMS 격리 PostgreSQL 3개 통과, lint 오류 0·기존 경고 8, production build·desktop/mobile 결과를 재사용한다. 커밋된 Web 파일의 SHA manifest와 Git archive digest를 생성한다.

Zorin 대상은 기존 `/home/approid/apps/music-pie`·`approid@192.168.219.174`·`music-pie` Compose project·공개 `https://mrms.approid.team`이다. 현재 release는 `20261003-editorial-variety-3cd1ea3`다. Git archive로 새 Web image를 먼저 build한다. DB custom-format backup·`pg_restore --list`·기존 개인 추천/좋아요/MMS 데이터 비교를 확인한 뒤 기존 checksum migration runner로 pending 034만 적용한다. 운영 비밀값은 기존 env_file로만 전달하며 값·쿠키·dump를 저장소나 출력에 기록하지 않는다.

034 적용 후 Web만 교체하고 다른 container는 유지한다. 기존 Web image/current release를 rollback 대상으로 보존한다. 새 Web 이상 시 이전 Web으로 복구하되 034는 기존 Web과 호환되는 추가 table이므로 데이터 손실을 막기 위해 운영에서 자동 down하지 않는다. 소스 SHA·image revision/archive label·readiness·API 접근 경계를 확인하고 기록한다. 운영 실제 수락·좋아요·삭제 요청은 실행하지 않는다.

## 객관적 완료 체크

1. 범위·품질: 이번 파일만 staged, 비밀값/cache/dump 경로 0, `git diff --cached --check` exit 0, 직전 테스트/lint/build 증거 및 commit Web manifest 검증.
2. Git: 기능 커밋과 결과 문서 커밋 모두 push exit 0, 각각 HEAD=origin/main=remote main, 기존 사용자 변경 보존.
3. DB: migration 전 backup size/digest·`pg_restore --list` 성공, pending 034 한 건, 034 table·checksum 기록, 개인 데이터 전후 snapshot/count 일치.
4. 배포: 서버 image build exit 0, Web source SHA/commit label/archive digest 일치, current release·healthy/restart 0·내부/공개 ready 200·비-Web container ID 동일·rollback 보존·임시 archive 정리.
5. 운영 접근·기록: 공개 `/gms` HTTP 200·옛 history redirect·비회원 DELETE 401, 브라우저 공개 화면/로그인 가능 시 조회·삭제 확인 취소만 검증, 운영 증거/미검증·다음 작업 기록과 문서 링크/diff 검사.

5개 필수 체크가 모두 PASS일 때 완료로 보고한다. 로그인된 실계정 삭제·수락과 실제 모바일 기기·TIDAL 재생은 별도 미실행 항목이다.

## 실행 결과

- PASS 1 — `d7fd609` 25파일·Web SHA 20/20, 직전 Web 610개/격리 DB 3개 및 lint/build 통과 결과 유지, 서버 build exit 0.
- PASS 2 — 기능·결과 문서 commit 각각 push exit 0·HEAD/remote 일치, 사용자 13개 파일 해시 보존 확인.
- PASS 3 — backup 298,223,660bytes·목록 검사 성공, 기존 checksum 33개 일치·034 한 건 적용, 개인 14개 table 적용 전후/배포 후 hash·count 동일.
- PASS 4 — `20261004-gms-groups-d7fd609` healthy·restart 0·내부/공개 ready 200, image/source label 일치·비-Web ID 6/6 동일·rollback 보존·incoming archive 정리.
- PASS 5 — `/gms` 200·history 307 `/gms`·비회원 DELETE 401, 로그인 Chrome 4그룹/14곡/개별 제거 14개/그룹 삭제 4개·취소 후 보존/포커스 복귀·console error 0. 최종 문서 링크/diff 검사 exit 0.

초기 script CRLF/SSH 인용 오류는 운영 변경 전에 발생해 전달 형식을 수정하고 전체 배포 검증을 다시 수행했다. 제품 소스는 바꾸지 않았다. 구체적 digest·container·보존/미실행 범위는 [배포 결과](../changes/2026-10-04-gms-grouped-deploy.md)에 있다.
