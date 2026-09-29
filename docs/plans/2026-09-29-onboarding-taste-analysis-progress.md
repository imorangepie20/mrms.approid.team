# 온보딩 취향 분석 진행률 표시 계획

## 목표

회원가입과 TIDAL 연결 뒤 플레이리스트를 MMS로 가져오는 동안 사용자가 현재 처리 단계와 실제 처리량을 알 수 있도록 진행 상태를 표시한다. 시간 추정값을 만들지 않고 기존 API가 반환하는 수치만 사용한다.

## 변경 범위

1. 플레이리스트 import 중에는 전체 작업량을 아직 알 수 없으므로 접근 가능한 무한 진행 바를 표시한다.
2. MusicBrainz 보강은 import 결과의 `enrichmentPendingCount`를 최초 분모로 사용하고, 각 요청이 반환하는 `remaining`으로 처리 수를 계산한다. 감소 건수에는 terminal failure가 포함될 수 있으므로 성공이나 보강 완료로 표현하지 않는다.
3. 임베딩은 `embeddedTrackCount + remaining + failedTrackCount`를 분모로 사용하고 성공한 `embeddedTrackCount`를 현재 값으로 표시한다.
4. `profileReady`가 실제로 참이 된 완료 화면에서만 100% 완료 상태를 표시한다.
5. 분석 실패와 재시도 중에도 마지막으로 확인한 진행 수치와 분모를 유지한다.
6. 기존 완료 화면의 수동 `추천 보러 가기` 링크를 유지한다.
7. `role`, 접근 가능한 이름, `aria-valuetext`, 상태 메시지를 기준으로 회귀 테스트한다.

## 제외 범위

- 추천 자동 생성 또는 완료 뒤 자동 이동
- DB schema와 API 응답 계약 변경
- 새로고침 뒤 실행 중인 작업의 자동 복구
- 운영 사용자 데이터 생성과 외부 환경 변경

## 변경 파일

- `apps/web/src/components/onboarding/tidal-onboarding.tsx`
- `apps/web/src/components/onboarding/tidal-onboarding.test.tsx`
- `apps/web/src/app/styles/onboarding.css`
- `apps/web/src/app/styles/responsive.css`

## 구현 순서

1. import·보강·임베딩·완료·실패/재시도 진행 상태의 접근성 회귀 테스트를 먼저 추가하고 실패를 확인한다.
2. 기존 상태 전이에 단계별 실제 수치를 보존하는 최소 상태와 진행 UI를 추가한다.
3. `390px` 폭에서 레이블과 수치가 겹치지 않도록 반응형 스타일을 추가하고, 무한 진행 표시의 움직임은 `prefers-reduced-motion`에서 제거한다.
4. focused Vitest, 대상 ESLint, `git diff --check`를 실행한다.

## 완료 기준

- import 진행 바에는 확정되지 않은 `value`가 없다.
- 보강 진행 바는 최초 pending 수를 분모로 하고 remaining 감소를 반영한다.
- 임베딩 진행 바는 API의 성공·남음·실패 합계를 분모로 사용한다.
- 실패 화면과 재시도 직후에도 마지막 진행 값이 사라지지 않는다.
- `profileReady` 전에는 완료 상태를 표시하지 않고, 완료 화면에서만 100%가 노출된다.
- 기존 `추천 보러 가기` 링크가 `/gms`를 유지한다.

## 검증 기록

- RED: `npx vitest run src/components/onboarding/tidal-onboarding.test.tsx --reporter=verbose --maxWorkers=1`
  - 구현 전 19개 중 신규 진행률 테스트 5개 실패, 기존 14개 통과를 확인했다.
  - 실패 원인은 import·보강·임베딩·완료·재시도 화면에 요구한 `progressbar`가 아직 없었기 때문이다.
- GREEN: `npx vitest run src/components/onboarding/tidal-onboarding.test.tsx --reporter=verbose --maxWorkers=1`
  - 1개 파일, 19개 테스트 통과.
- 온보딩 focused 회귀: `npx vitest run src/app/onboarding/page.test.tsx src/components/onboarding/tidal-onboarding.test.tsx --reporter=verbose --maxWorkers=1`
  - 2개 파일, 20개 테스트 통과.
- ESLint: `npx eslint src/components/onboarding/tidal-onboarding.tsx src/components/onboarding/tidal-onboarding.test.tsx` 통과.
- Web 전체 테스트: `npm test -- --run --maxWorkers=1`
  - 144개 파일 중 141개 통과·3개 skip, 총 555개 테스트 중 552개 통과·3개 skip.
- Web 전체 lint: `npm run lint`
  - 오류 0개, 기존 경고 6개.
- production build: `npm run build`
  - Next.js 16.3.5 production build와 TypeScript, 52개 route 생성을 통과했다.
- 코드 검토에서 MusicBrainz terminal failure도 `remaining` 감소에 포함될 수 있다는 지적을 반영해 성공을 뜻하는 `보강 완료` 대신 중립적인 `처리`로 표시했다. 수정 후 focused 20개와 production build를 다시 통과했다.
- `git diff --check` 통과.

## 미검증 항목

- 실제 로그인 계정으로 import·MusicBrainz 보강·임베딩을 실행하는 브라우저 검증은 사용자 데이터를 만들 수 있어 수행하지 않았다.
- 실제 `390×844` 브라우저 viewport 시각 검증은 운영 배포 후 읽기 전용으로 확인한다.
