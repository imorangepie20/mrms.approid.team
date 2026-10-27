# 스킬·플러그인 환경 기록

## 2026-10-27 Claude Code(데스크톱 Code 탭) 이관

Codex에서 실제로 쓰던 구성을 기준으로 Claude Code에 맞춰 정리했다. 판단 근거는 `~/.codex/config.toml`의 `[[skills.config]]`·`[plugins.*]` 값이다. Codex에서 `enabled = false`로 꺼 둔 스킬(Caveman·디자인 계열, ECC 326개, designlang·diagram-design 스킬 등)은 이관 대상에서 제외했다.

| 항목 | 범위·경로 | 출처·버전 | 조치 | 확인 결과 |
|---|---|---|---|---|
| superpowers 절차 스킬(5절 13개 + diagnosing-superpowers) | 사용자 전역 플러그인 `superpowers@claude-plugins-official` | 7.0.0 | 기존 설치 유지 | `claude plugin list` enabled, 세션 노출 확인 |
| karpathy-guidelines, vercel-composition-patterns, vercel-react-best-practices, web-design-guidelines | `~/.claude/skills/` (vercel·web-design은 `~/.agents/skills` junction) | 기존 | 유지 | 세션 노출 확인 |
| `ui-ux-pro-max` | `~/.claude/skills/ui-ux-pro-max` → `~/.agents/skills/ui-ux-pro-max` junction | 원본 패키지 전체 공유 | 신규 연결 | 세션 노출 확인, 기능 실행 미검증 |
| `investigate-first` | `~/.claude/skills/investigate-first` → `~/.agents/skills/investigate-first` junction | 같음 | 신규 연결 | 세션 노출 확인, 기능 실행 미검증 |
| `harness@harness-marketplace` | 프로젝트 `.claude/settings.json` (`revfactory/harness` GitHub 마켓플레이스) | 2.1.0 | 신규 설치 | `claude plugin list`에서 project scope enabled. 같은 세션 후속 턴에서 `harness:harness`·`harness:evolve` 스킬 노출 확인, 기능 실행 미검증 |
| frontend-design, context7 | 사용자 전역 플러그인 | 기존 | 유지 | context7 MCP는 인증 필요 상태(`/mcp`) |

제외·미이관:

- `deploy-to-vercel`: 배포 대상이 Zorin Docker compose(`infra/compose.zorin.yml`)라 이관하지 않았다.
- `claude-mem@claude-mem-local`: 로컬 마켓플레이스·훅·sqlite 워커를 쓰는 별도 메모리 시스템이다. Claude Code 자체 메모리와 중복되고 데이터 보관 정책이 미정이라 설치하지 않았다.
- ECC, designlang, diagram-design: Codex에서 스킬 전부 비활성이었다.
- `openai-bundled`·`openai-primary-runtime` 플러그인: Codex 전용. Claude Code에서는 내장 브라우저·Chrome 확장·`anthropic-skills`(docx/pdf/xlsx/pptx)·visualize로 대체된다.
- `.codex/hooks.json` Impeccable 훅: 이 프로젝트에 해당 파일이 없어 이관 대상이 없다.

## 2026-10-04 Hindsight 프로젝트 등록

- 로컬 Docker의 `ghcr.io/vectorize-io/hindsight:0.10.2` 서비스가 실행 중이다. `http://127.0.0.1:8888/openapi.json`의 버전·API 계약과 `/health` HTTP 200·database connected를 확인했다.
- 현재 세션에 Hindsight 전용 MCP 도구는 노출되지 않았으며 Codex MCP 설정에서 Hindsight 연결도 확인되지 않았다. 설치·활성화 상태를 MCP 노출 상태와 동일하게 취급하지 않는다.
- 이미 실행 중인 HTTP API로 Music Pie 전용 `music-pie` 뱅크 생성·비동기 retain·문서 재조회·recall을 실제 실행했다. 서비스 설치, MCP 설정 변경, 자동 동기화 구성은 수행하지 않았다.
- 등록 원고·작업 UUID·검증 근거는 `docs/changes/2026-10-04-hindsight-project-registration.md`에 기록한다.

## 2026-10-03 GMS 재점검 세션

- `computer-use`의 `SKILL.md`, guidance와 confirmations를 읽었다. 현재 세션은 native app 제어가 비활성이고 `mcp__cua_repl` 브라우저 제어가 노출되어 Chrome GMS·이력·MMS에서 실제 탐색·재생·viewport 점검을 실행했다.
- 스킬 캐시 경로는 `openai-bundled/computer-use/26.930.21537`다. 캐시 존재·세션 도구 노출·이번 실행은 확인했으며 별도의 plugin installed/enabled 조회나 native `sky` 실행은 하지 않았다.
- 설치·설정·배포는 수행하지 않았다. 결과는 `docs/changes/2026-10-03-gms-functional-review.md`에 기록했다.

## 2026-09-26 Codex Desktop 확인

- 이번 멜론 수집 작업에서 `ecc:orch-add-feature` 2.2.2 스킬 파일을 읽고 조사·계획·구현·코드 및 보안 검토 단계를 실행했다. 설치 상태와 별개로 실제 단계 사용을 확인했다. 상위 개발 지침에 따라 테스트 추가·실행 및 두 확인 게이트는 적용하지 않았다.

- 사용자 요청에 따라 공식 `affaan-m/ECC` 마켓플레이스를 Codex에 등록하고 `ecc@ecc` 2.2.2를 설치했다.
- `codex plugin list --json`에서 `installed: true`, `enabled: true`를 확인했다. 설치 경로는 사용자 전역 `~/.codex/plugins/cache/ecc/ecc/2.2.2`다.
- 현재 대화의 스킬 노출 갱신과 Codex 훅 신뢰·실행은 확인하지 않았다. 새 작업에서 사용 가능 여부를 별도로 확인한다.
- 아래의 2026-09-21 기록은 당시 OLKIL 런타임에 대한 기록이며 이번 Codex Desktop 상태를 나타내지 않는다.

기준일: 2026-09-21 / 환경: Windows (`win32`), OLKIL 코딩 에이전트, PowerShell 5.1

`portable-project-harness.md` 4.5절 양식을 이 런타임에서 확인한 상태로 채웠다. 설치 파일 존재, 세션 노출, 실제 실행은 서로 다른 상태이므로 구분해서 기록한다.

## 런타임 내장 도구

| 이름 | 범위 | 세션 노출 | 최소 실행 결과 | 용도 |
|---|---|---|---|---|
| `bash` | 내장 | 확인 | 본문에서 git·PowerShell·경로 확인 명령 실행 | 명령·git·npm 실행 |
| `read`, `write`, `edit` | 내장 | 확인 | 본문에서 문서 읽기·편집·생성 실행 | 파일 읽기·생성·편집 |
| `glob`, `grep` | 내장 | 확인 | `**/*.md` 목록으로 41개 파일 확인 | 파일·내용 검색 |
| `task`, `todowrite` | 내장 | 확인 | `todowrite`로 작업 목록 유지 | 하위 에이전트 위임·작업 추적 |
| `skill` | 내장 | 확인 | 미검증: 이번 작업에서 스킬 로드를 사용하지 않음 | 사용자 전역 스킬 로드 |
| `question`, `webfetch` | 내장 | 확인 | 미검증: 이번 작업에서 미사용 | 사용자 확인·URL 가져오기 |

## 사용자 전역 스킬 58개

하네스 6절의 전역 스킬 58개와 이 런타임의 세션 제공 목록을 이름·분류별 개수(13 + 8 + 9 + 8 + 6 + 14 = 58)로 대조하여 전부 일치함을 확인했다.

| 항목 | 범위·경로 | 설치 출처·버전 | 세션 노출 | 최소 실행 결과 | 용도 |
|---|---|---|---|---|---|
| 개발 절차·계획·협업 13개 | 사용자 전역 (`~/.agents/skills/`) | 미확인: 설치 출처와 버전은 본문에서 조사하지 않음 | 확인: 세션 제공 목록에 이름 존재 | 미검증: 이번 작업은 문서 변경이라 스킬 기능을 호출하지 않음 | 5절 매핑에 따라 해당 작업에서 `skill` 도구로 로드 |
| 변경 범위·조사·품질 8개 | 사용자 전역 | 미확인 | 확인 | 미검증: 같은 이유 | 위와 같음 |
| 디자인·시각화 9개 | 사용자 전역 | 미확인 | 확인 | 미검증: 같은 이유 | 위와 같음 |
| 웹·React·Vercel 8개 | 사용자 전역 | 미확인 | 확인 | 미검증: 같은 이유 | 위와 같음 |
| 글·스킬·도구 6개 | 사용자 전역 | 미확인 | 확인 | 미검증: 같은 이유 | 위와 같음 |
| Caveman 계열 14개 | 사용자 전역 | 미확인 | 확인 | 미검증: 같은 이유 | 위와 같음 |

세션 노출만 확인한 상태이며 각 스킬의 실제 기능 실행은 검증하지 않았다. 이름 목록이 제공된 것이 스킬 설치나 인증을 증명하지 않는다.

## 플러그인

하네스 7.1·7.2·8절의 플러그인과 훅은 원본 환경의 Codex 런타임(`~/.codex/config.toml`, `.codex/hooks.json`) 구성이다. 이 런타임은 플러그인 시스템과 `PostToolUse`/`Stop` 훅을 제공하지 않으므로 전부 미지원이다.

| 항목 | 원본 환경 상태 | 이 런타임 상태 |
|---|---|---|
| 명시 활성 플러그인 15개 (7.1) | 원본 `config.toml`에서 활성 값 확인 | 미지원: Codex 전용 구성 |
| 캐시·추가 제공 3개 (7.2) | 원본에서 캐시·노출 확인 | 미지원: 같은 이유 |
| `harness@harness-marketplace` 1.2.0 | 하네스 설계·감사용 | 미지원: 이 프로젝트는 12절 내장 절차로 대체 |
| Impeccable 로컬 스킬·실행기·훅 (8절) | 원본 `.agents/skills/impeccable`과 `.codex/hooks.json` | 미지원: 훅 형식 없음. UI 작업 시 `impeccable` 전역 스킬은 세션 노출 확인 |

## 이번 적용에 사용한 절차

- 12.1 내장 절차(조사 → 범위 정의 → 계획 → 구현 → 검증 → 검토 → 인계)를 외부 스킬 없이 직접 수행했다.
- 12.2 `apply-harness.ps1`은 실행하지 않았다. 필수 문서 7개가 이미 프로젝트 실제 내용으로 존재하여 전부 `EXISTS` 보존 대상이기 때문이다.
- 원본 프로젝트(`hotelChainManager`)의 업무·포트·DB·계정·배포 대상·버전은 이 프로젝트의 사실로 사용하지 않았다.

## 미검증·제약

- 스크립트(`apply-harness.ps1`)의 재실행 해시 유지, 다른 프로젝트 적용, 원격 설치 출처의 현재 상태, 훅·플러그인 실제 실행은 전부 미검증이다.
- 전역 스킬 58개의 설치 출처·버전·기능 실행은 이번 작업 범위가 아니었다. 필요한 작업이 생기면 그때 해당 스킬을 로드하고 실행 결과를 이 표에 추가한다.
- 이 기록은 문서 준비 상태이며 `설치·동작 검증 완료`가 아니다.

## 2026-10-09 K-Pop 섹션 추가에서 사용한 스킬

- `ui-ux-pro-max`: 로컬 `C:/Users/jowoo/.agents/skills/ui-ux-pro-max/SKILL.md` 존재와 현재 세션 노출을 확인하고 읽었다. `search.py 'horizontal music rail keyboard mobile' --domain ux` exit 0, viewport overflow 가이드를 적용했다. 실제 운영 390px/1440px·기존 rail End/Home 키를 검증했다. 이번 작업에서 스킬이나 플러그인을 설치하지 않았다. 상세는 [K-Pop 섹션 결과](../changes/2026-10-09-kpop-screen-sections.md)에 있다.
