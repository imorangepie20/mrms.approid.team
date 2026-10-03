# GMS +MMS 운영 적용·실제 클릭 검증

## 원인과 해결

사용자가 `+ MMS` 클릭 뒤 액션과 MMS 변화가 없다고 재신고했고 대상은 `https://mrms.approid.team`임을 확인했다. 운영 current는 여전히 `/home/approid/apps/music-pie/releases/4636ee2`였고 이전 로컬 수정은 적용되지 않았다. 실제 운영 기능까지 해결하지 못한 것이 가장 앞선 원인이다.

앞선 저장 응답 처리·수락 영속 조회·모바일 이력 수정을 Web에 적용했다. 추가로 곡명 포함 `MMS에 추가했습니다` 성공 안내와 `MMS 보기` 링크를 제공한다. 성공 행은 즉시 제거하고 처리 중 결정·새 추천을 막는다. 저장 완료 후 GMS/history/MMS를 revalidate해 이후 조회를 갱신한다. 프로필 갱신 실패에도 저장된 결정은 반영하며 안내한다. 수락과 하트는 별도다.

## 소스·검증

- `apps/web/src/components/dashboard/music-dashboard.tsx`: `decisionNotice`와 저장 중/성공 상태 및 MMS 링크.
- `apps/web/src/app/api/recommendations/decisions/route.ts`: 저장 성공 직후 `/gms`, `/gms/history`, `/mms` revalidation. 저장 실패·미인증·잘못된 입력에는 없음.
- 관련 Next API 근거: 설치된 `next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`와 `revalidatePath.md`. Route Handler invalidation은 다음 방문에 적용되므로 실제 navigation/reload까지 검증했다.
- 구현 전 회귀에서 성공 안내 누락 1개와 invalidation 누락 2개를 재현했다. 이는 완료 체크 1·2의 두 계층이다. 안내·invalidation 원인을 수정하고 전체 검증을 재실행했다. 링크 화살표는 `aria-hidden`으로 접근성 이름을 `MMS 보기`로 유지했다.
- `apps/web`에서 `npm test -- src/components/dashboard/gms-functional-review.test.tsx src/app/api/recommendations/decisions/route.test.ts src/components/dashboard/music-dashboard.test.tsx src/app/mms/page.test.tsx src/components/music/mms-library.test.tsx`: 5개 파일·38개 테스트 통과, exit 0.
- `npm test`: 143개 파일 통과·4개 조건부 skip, 564개 테스트 통과·6개 skip, exit 0. 로그 `%TEMP%/music-pie-gms-production-test.log`.
- `npm run lint`: exit 0, 오류 0·기존 경고 6. `npm run build`: exit 0, TypeScript와 52개 route 생성. 서버 Docker image build exit 0. image build에는 실제 비밀 환경 파일을 포함하지 않아 Auth0 build-time 옵션 경고가 있었으며 runtime에는 기존 운영 설정을 유지했다.
- `git diff --check`: exit 0. 운영 source 파일 8개의 SHA-256을 로컬과 비교해 8/8 일치했다.

## 운영 release와 경계

- release: `/home/approid/apps/music-pie/releases/20261003-gms-mms-00162fc401c5`.
- 소스 archive: 751개 파일·6,353,920바이트, SHA-256 `00162fc401c50e9c0067ea362da705a66de7c3438dd7f74b85404f6e4a6950e8`. 추적 파일과 이번 GMS 문서·테스트만 포함하고 실제 `.env`, 비밀값, 캐시, node_modules, DB dump를 제외했다. 별도 commit/push 없이 검증한 현재 작업 트리 snapshot으로 배포했다.
- Web image: `sha256:0c4fc396dee813c4e23b6f1015a3453c8a07fb62b79fa53e0db81f62d95bb5cb`, source digest label 일치.
- Web container: `3747b43dfe335fd0ec77814c0cde5bb3b85a904e5edb0269ac16142e397edb2e`, healthy, restart 0.
- Compose `config --quiet` 통과 후 Web만 `up -d --no-deps --no-build --force-recreate web`로 교체했다. local/public `/api/health/ready` HTTP 200. schema·마이그레이션·EMS 작업·외부 권한 변경 없음.
- 비-Web container ID 전후 비교 일치. 서버 근거: `shared/artifacts/20261003-gms-mms-00162fc401c5/nonweb-before.txt`, `nonweb-after.txt`.
- rollback: 이전 release `/home/approid/apps/music-pie/releases/4636ee2`, 이전 image `sha256:6ad5ba6471fedfd28f86547acbef637527b8ddb6e6e97c377955d304443f8ec1`, 보존 tag `music-pie-web:pre-gms-mms-20261003`. 실패 시 이전 image·current를 복원하도록 배포 script를 준비했으며 실제 rollback은 필요하지 않았다. script와 rollback 근거는 같은 서버 artifact 폴더의 `deploy.sh`, `rollback.txt`에 보존한다.
- 로컬 임시 archive·파일 목록·deploy script와 서버 incoming archive는 제거했다. 저장소의 기존 변경은 유지했다.

## 실제 운영 브라우저

기존 로그인 Chrome에서 MMS를 reload하자 기존 수락 5곡이 표시됐다. 하트는 0곡으로 유지됐다. GMS에서 실제 `Good Times Boogie`의 `+ MMS`를 한 번 클릭했다. 이 검증은 사용자 계정에 수락 결정과 그에 따른 취향 갱신 1건을 남겼다.

1. 저장 중 안내와 결정·새 추천 버튼 disabled를 확인했다.
2. `Good Times Boogie` 성공 안내와 MMS 보기 링크, GMS 대기 8→7, 해당 행 제거를 확인했다.
3. MMS 링크로 이동해 수락 5→6과 해당 곡을 확인했다.
4. MMS를 새로고침해 6곡과 해당 곡 유지, 하트 0을 확인했다.
5. browser console error/warning 0, 교체 후 Web error/exception/failed 로그 0, healthy·restart 0을 확인했다. 사용자 탭은 MMS로 남겼다.

증거: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/gms-production/`의 `gms-accepted-live.png`, `mms-accepted-live.png`, `mms-accepted-section-live.png`, `verification.json`.

## 완료 체크

- PASS — 클릭 상태: GMS 회귀 7개와 운영 저장 중·성공 안내·행 제거·MMS 링크 확인.
- PASS — 영속 경계: 결정 API 회귀 6개·MMS page/library 테스트, 운영 navigation/reload 후 수락 6곡 유지.
- PASS — 품질: 전체 테스트 564개 통과, lint 오류 0, TypeScript·52 route build, diff check exit 0.
- PASS — 운영 적용: source 8/8 digest 일치·고유 image/current·local/public 200·healthy·restart 0·비-Web ID 동일.
- PASS — 실제 화면: `Good Times Boogie` 클릭으로 GMS 8→7·MMS 5→6·reload 6, 운영 screenshot·console/Web 오류 0.
- PASS — 경계·기록: 비밀 환경·DB dump 제외 snapshot, schema 변경 없음, rollback 근거 보존, 로컬 임시 파일 0·서버 incoming archive 제거와 문서 갱신.

## 미검증 사항

- 전용 DB URL이 없는 기본 전체 테스트의 조건부 6개는 skip됐다. GMS/오디오 프로필 관련 5개는 앞선 수정에서 격리 PostgreSQL 통합으로 통과했고 이번 DB 조회 소스는 동일하다. 나머지 관리자 오디오 품질 DB 테스트 1개는 변경 범위 밖이며 전용 환경 미지정으로 미실행이다.
- 운영의 실패·partial 응답을 의도적으로 발생시키지는 않았다. 이 경계는 회귀 테스트로 검증했다. rollback script의 실제 운영 실행은 정상 배포로 불필요해 미실행이다.
