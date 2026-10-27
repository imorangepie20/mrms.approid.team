# GMS +MMS 버튼 진행 표시

## 이유

GMS 추천 트랙에서 `+ MMS`를 누르면 저장 요청이 끝날 때까지 버튼 모양이 그대로라 눌렸는지 알 수 없었다.

## 변경

- `apps/web/src/components/dashboard/music-dashboard.tsx`: 저장 중인 결정(`pendingDecision`: 트랙 ID·accept/reject)을 상태로 두고 `Gateway` → `RecommendationHistoryList`로 넘긴다.
- `apps/web/src/components/recommendations/recommendation-history-list.tsx`: 누른 트랙의 `+ MMS` 버튼을 저장 중에는 회전 아이콘만 보이게 바꾸고(숨긴 `+ MMS` 라벨로 버튼 폭 유지) `aria-busy="true"`, 접근 이름 `MMS에 추가 중`, disabled로 표시한다. 성공하면 기존처럼 `MMS로 보냄` 상태가 되고, 실패하면 `+ MMS`로 돌아온다.
- `apps/web/src/app/styles/dashboard.css`: `.gms-decision-button--pending`, `.gms-decision-spinner`를 추가했다. `prefers-reduced-motion: reduce`에서는 회전하지 않는다.

## 검증

- 새 테스트 2개(`gms-functional-review.test.tsx`: 저장 중 표시·성공 후 해제, 실패 후 복구)가 변경 전 실패, 변경 후 통과
- `npx vitest run src/components/dashboard src/components/recommendations`: 3 파일 41개 통과
- `npx tsc --noEmit`, 변경 파일 eslint 통과

- 커밋 전 전체 `npx vitest run` 146 파일 통과·5 skipped(612 통과·9 skipped), `npm run lint` error 0(기존 warning 8), `npm run build` 통과

## 운영 배포(2026-10-27)

커밋 `fdcaa16974138edbc658849ded5685e9ead04f7a`를 push하고 Zorin Web만 교체했다. migration·다른 서비스 교체는 없다.

- source: `git archive fdcaa16`, SHA-256 `1ca98788733e47bcae7b4c11697974162c3c79f6e059907ce949205284aa9238`
- release `/home/approid/apps/music-pie/releases/20261027-gms-mms-progress-fdcaa16`, image `music-pie-web:gms-mms-progress-fdcaa16`(revision·source-sha256 label 일치)
- override `shared/compose.gms-mms-progress.yml`을 `compose.admin-layout.yml` 대신 붙여 `up -d --no-deps --no-build --force-recreate --pull never web`. 새 image가 직전 관리자 레이아웃 변경을 포함한다.
- 결과: healthy·restart 0, 내부 `/`·`/ems` 200, `/admin` 307 → 로그인, 없는 경로 404, readiness 200, `.next/static`에 `gms-decision-spinner` 포함 파일 2개, 최근 5분 Web 로그 error 0, 비-Web container 6개 ID 전후 동일. 공개 `https://mrms.approid.team`의 `/`·`/gms` 200, `/admin` 307, readiness 200
- rollback: 이전 image `sha256:7d69fe824ba0e5043c2e5cfc5430b470ed7f7bf5254807e4838bf4e9422f6b2e`(관리자 레이아웃 배포본), tag `music-pie-web:pre-gms-mms-progress-20261027`
- 서버 증거: `shared/artifacts/20261027-gms-mms-progress-fdcaa16/`

## 미검증

- 로그인한 운영 브라우저에서 실제 `+ MMS` 클릭 시 회전 아이콘 모양·모바일 폭은 확인하지 않았다. 실제 클릭은 운영 계정의 MMS 데이터를 바꾸므로 실행하지 않았다.
