# 2026-09-21 하네스 이 런타임 적용

- 날짜·작업명: 2026-09-21, `portable-project-harness.md`를 이 런타임(OLKIL 코딩 에이전트)에 맞춰 적용
- 변경 이유: 사용자가 "네게 맞도록 적용해"라고 요청했다. 하네스 12.3의 마무리 항목(기존 파일 병합, 참조 경로 확인, 외부 스킬 없이 작업 가능, 변경 검증)을 이 프로젝트에서 완료해야 했다.
- 최종 동작·관련 경로:
  - `AGENTS.md`에 12.1 내장 절차의 누락 항목을 병합했다. `구현과 검증`에 `docs/plans/` 계획 기록과 diff 검토 항목을 추가하고, 새 `위임과 확장` 절에 위임 조건, 스킬·플러그인 선택 확장, 환경 기록 경로를 적었다. 기존 도메인 원칙·프로젝트 경계·문서화 규칙은 그대로 보존했다.
  - `docs/harness/skill-plugin-environment.md`를 4.5 양식으로 새로 작성했다. 런타임 내장 도구, 사용자 전역 스킬 58개의 세션 노출, Codex 플러그인·훅의 미지원 상태를 구분해서 기록했다.
  - 필수 문서 7개와 템플릿은 이미 프로젝트 실제 내용으로 존재하여 전부 보존했다. 12.2 스크립트는 실행하지 않았다.
- 실제 실행한 검증·결과:
  - `AGENTS.md`가 참조하는 문서 16개 경로 존재 확인: 16/16 통과.
  - 하네스 6절 전역 스킬 58개와 이 런타임 세션 제공 목록 대조: 58/58 이름과 분류별 개수 일치.
  - `docs/` 하위 디렉터리 확인: `changes`, `decisions`, `deployment`, `harness`, `overview`, `plans`, `project-rules`, `superpowers` 존재. `architecture`는 없으며 관련 설계가 생기면 만든다.
  - `apps/web/package.json`에서 실제 검증 명령 확인: `npm test`(`vitest run`), `npm run lint`(`eslint`), `npm run build`(`next build`).
- 미검증 항목·이유:
  - 전역 스킬 58개의 설치 출처·버전·기능 실행. 이번 작업은 문서 변경이라 스킬을 호출하지 않았다.
  - `apply-harness.ps1` 실행과 재실행 해시 유지. 필수 문서 7개가 이미 존재해 스크립트가 다룰 대상이 없었다.
  - 제품 기능 변경은 없었으므로 `npm test`·`npm run lint`·`npm run build`는 이번 변경에 실행하지 않았다. 이전 실행 결과는 `docs/overview/current-development-context.md` 검증 표에 있다.
- 다음 작업·시작 위치: UI 작업이 생기면 `impeccable` 스크립트 설치·세션 노출·실행을 이 표에 추가한다. 그 외는 `docs/overview/current-development-context.md`의 다음 작업을 따른다.
