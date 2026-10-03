# GMS 변경 커밋·푸시·재배포 결과

사용자가 커밋·푸시·배포를 요청해 직전 검증된 GMS/MMS·추천 이력 선택 삭제·HUD 성공 알림/삭제 확인창과 관련 회귀/기록 30파일을 main에 커밋했다. 새 제품 코드는 추가하지 않았다. 기능 커밋과 운영 증거를 기록하고, 이 결과 문서만 별도 커밋·푸시한다.

## 객관적 완료 체크

1. PASS — 범위·품질: staged 30파일에 비밀값·캐시·DB dump 경로 0개, `git diff --cached --check` exit 0. Web 변경 18파일은 직전 검증된 release와 정규화 SHA 18/18 일치하며 Git archive 배포 후에도 18/18 일치. 직전 전체 144파일 575개·관련 7파일 59개 통과, lint 오류 0·기존 경고 6, 52개 route build exit 0 결과를 재사용했다. 이번 Git archive의 서버 Docker production build·TypeScript도 exit 0.
2. PASS — Git: `f71ec9e23ba0b9c3f0613f029e3d3845928646d1` (`fix(gms): persist MMS additions and add history selection dialogs`) 커밋·main push exit 0. HEAD·origin/main·`git ls-remote origin refs/heads/main`이 모두 해당 SHA였고 작업 트리는 clean이었다. 배포 후 결과 문서 커밋도 같은 방식으로 push/remote SHA/clean을 확인한다. 운영 기능은 아래 revision label의 f71ec9e다.
3. PASS — 운영: 아래 release·archive/revision label·healthy·restart 0·local/public readiness 200·비-Web ID diff 0·rollback 보존과 임시 archive 삭제를 확인했다. 운영 추천·취향 데이터에 새 수락/삭제 검증을 수행하지 않았다.

## 운영 증거

- release: `/home/approid/apps/music-pie/releases/20261003-gms-f71ec9e`
- source: `git archive HEAD`, 6,512,640bytes, SHA-256 `0acf2917765cb39bd7ab96dc711d05ac787f930c607523e6dccaadb3e940010b`
- `org.opencontainers.image.revision`: `f71ec9e23ba0b9c3f0613f029e3d3845928646d1`
- Web image: `sha256:d6afa2f813413b19828137e360a5d66a1e6fd720c599c6ef8547be5ee5605632`
- container: `0e910de50c8208231f4fd94233190fbff592c26db8fa837c8bd398dd29a7f584`, healthy·restart 0
- local/public `/api/health/ready`: 각각 200. 비-Web container ID before/after 동일.
- rollback: `20261003-template-dialog-47a7cd24e18f`, image `sha256:28b86b8978ce7c35958616821b07ca84642c372a1042905ab1137969e897f5e1`, 보존 tag `music-pie-web:pre-gms-commit-20261003`.
- 서버 `shared/artifacts/20261003-gms-f71ec9e/verification.txt`에 source/label·health·비-Web ID·archive 정리 PASS, `source.txt`에 Git SHA/digest, `rollback.txt`에 이전 release/image, `nonweb-before.txt`·`nonweb-after.txt`에 비교값을 보관한다. build/deploy/source-verify/finalize scripts와 SHA manifest도 해당 폴더에 보관한다.
- schema migration·runtime env·EMS/DB 서비스 교체는 수행하지 않았다. 소스 archive는 서버 incoming과 로컬 TEMP에서 제거했다.

## 별도 미실행 항목

직전 전체 테스트의 PostgreSQL 조건부 6개는 로컬의 `RECOMMENDATION_SHADOW_TEST_DATABASE_URL`, `AUDIO_TASTE_PROFILE_TEST_DATABASE_URL`, `AUDIO_ANALYSIS_TEST_DATABASE_URL` 미설정으로 skip됐다. 이번 작업은 검증된 제품 코드를 그대로 커밋·재배포하므로 전체 UI/DB 데이터를 다시 조작하지 않았다. 세부 기능 검증은 [선택 삭제·템플릿 적용 기록](2026-10-03-gms-history-selection.md)에 있다.
