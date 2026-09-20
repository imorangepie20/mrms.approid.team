# Bright Cinematic User Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

## 목표

관리자 화면은 건드리지 않고, 현재 사용자용 음악 탐색·추천·관리 화면을 밝은 코발트/스카이블루 기반의 시네마틱 인터페이스로 재구성한다. 홈은 탐색 밀도를 높이고, EMS·GMS·MMS·검색을 독립된 전역 흐름으로 제공하며, 비로그인 사용자는 공개 탐색과 미리듣기를 계속 사용할 수 있어야 한다.

## 아키텍처

기존 `MusicSessionProvider`를 사용자 상태와 플레이어 상태의 단일 소스로 유지하고, 화면은 재사용 가능한 탐색·탐색바·트랙 목록 컴포넌트로 분리한다. 스타일은 외부 UI 라이브러리 추가 없이 CSS 변수와 Tailwind 유틸리티로 구성하여, 모든 페이지의 내비게이션·고정 플레이어·접근성 상태가 같은 토큰을 사용하게 한다.

TIDAL OAuth, 서버 저장소, 개인 모델 학습은 이 작업의 범위 밖이다. 영구 제외의 서버 지속성은 데이터 보관·삭제 정책이 확정되기 전까지 추가하지 않으며, 현 세션에서의 제외 동작만 기존 범위대로 유지한다.

## 기술 스택

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4 및 `apps/web/src/app/globals.css`의 CSS 변수
- Vitest, Testing Library, jsdom

## 설계 명세

- [밝은 시네마틱 사용자 UI 설계](../specs/2026-09-20-bright-cinematic-user-interface-design.md)
- [기존 사용자 음악 경험 구현 계획](2026-09-20-user-music-experience.md)

## 전역 제약

- 관리자 템플릿과 관리자 경로는 수정하지 않는다.
- TIDAL 실제 인증·API 호출·토큰 저장을 추가하지 않는다.
- 개인별 제외 상태를 다른 사용자·EMS 카탈로그와 공유하거나 영속 저장하지 않는다.
- 모든 새 인터랙션은 키보드 조작, 명확한 포커스 표시, 44px 이상의 주요 터치 영역을 제공한다.
- 모바일 고정 내비게이션과 고정 플레이어가 본문·버튼을 가리지 않도록 공통 하단 여백을 적용한다.

## Review Focus

| 위험 입력 | 계획상 대응 |
| --- | --- |
| 전역 내비게이션이 페이지별 상태와 충돌 | 작업 1과 7에서 공통 컴포넌트·레이아웃만 상태 소유자로 두고 라우트 테스트를 추가한다. |
| EMS 필터가 개인 제외 또는 추천 상태를 오염 | 작업 3에서 EMS는 공개 카탈로그 전용 파생 데이터로 만들고 `MusicSessionProvider` 변경을 금지한다. |
| GMS 빠른 액션이 기존 추천 갱신을 깨뜨림 | 작업 4에서 기존 `PreferenceActions` 계약을 유지하고 행동별 회귀 테스트를 확장한다. |
| 모바일에서 고정 UI가 콘텐츠를 가림 | 작업 1·5·7에서 공통 안전 여백, 모바일 목록, 플레이어 레이아웃을 함께 검증한다. |
| 비로그인 사용자가 불필요하게 막힘 | 작업 2·3·4·6에서 공개 탐색·미리듣기와 인증 필요 액션을 각각 테스트한다. |

## 작업 1: 밝은 디자인 토큰과 전역 셸 구축

**파일**

- 수정: `apps/web/src/app/globals.css`
- 수정: `apps/web/src/app/layout.tsx`
- 생성: `apps/web/src/components/navigation/app-navigation.tsx`
- 생성: `apps/web/src/components/navigation/app-navigation.test.tsx`

**구현**

1. `globals.css`에 밝은 배경, 표면, 텍스트, 코발트, 스카이블루, 경계선, 포커스 링, 그림자 토큰을 선언하고, 선택·hover·focus-visible·disabled 상태를 일관되게 정의한다.
2. `AppNavigation`은 데스크톱 상단 바와 모바일 하단 바를 같은 링크 목록에서 렌더링한다. 링크는 `홈`, `EMS`, `GMS`, `MMS`, `검색`이며 각각 `/`, `/ems`, `/gms`, `/mms`, `/search`로 연결한다.
3. 루트 레이아웃에서 내비게이션과 공통 본문 셸을 배치하고, 고정 플레이어와 모바일 내비게이션에 필요한 `page-shell` 하단 안전 여백을 제공한다.
4. 기존 기능을 깨지 않도록 `MusicSessionProvider`와 플레이어 배치를 보존한다.

**검증**

1. 테스트를 먼저 작성하여 다섯 링크의 이름·경로와 현재 경로의 접근 가능한 표시를 검증한다.
2. `npm run test -- --run src/components/navigation/app-navigation.test.tsx`가 실패하는 것을 확인한 뒤 컴포넌트를 구현한다.
3. 같은 명령이 통과하는지 확인한다.

**커밋**

`feat(ui): add bright application shell and navigation`

## 작업 2: 홈을 짧은 히어로와 고밀도 탐색 레일로 재구성

**파일**

- 수정: `apps/web/src/app/page.tsx`
- 수정: `apps/web/src/app/page.test.tsx`
- 수정: `apps/web/src/components/music/music-rail.tsx`
- 수정: `apps/web/src/components/music/track-card.tsx`

**구현**

1. 홈 상단을 짧은 개인화 히어로로 바꾸고, 비로그인일 때는 공개 탐색을 유지하면서 TIDAL 연결을 유도하는 보조 CTA만 보인다.
2. `MusicRail`을 밝은 표면의 가로 탐색 레일로 정리하고, 섹션 제목·설명·더 보기 링크·키보드 포커스 가능한 카드 흐름을 제공한다.
3. `TrackCard`에 밀도 높은 메타 정보와 재생 진입점을 유지하되, EMS/GMS/MMS에서 재사용 가능한 시각적 기본형을 만든다.
4. 추천·미리듣기·연결 CTA의 현재 상태 계약을 바꾸지 않는다.

**검증**

1. 홈 테스트에 비로그인 공개 탐색, TIDAL 연결 유도, 레일 제목과 재생 버튼을 추가해 먼저 실패시킨다.
2. `npm run test -- --run src/app/page.test.tsx`를 통과시킨다.
3. 375px 및 1280px 뷰포트에서 히어로, 레일, 고정 UI가 겹치지 않는지 브라우저로 확인한다.

**커밋**

`feat(ui): redesign home for dense music discovery`

## 작업 3: 공개 EMS 카탈로그와 검색 흐름 추가

**파일**

- 수정: `apps/web/src/lib/music/types.ts`
- 수정: `apps/web/src/lib/music/fixtures.ts`
- 생성: `apps/web/src/lib/music/catalog.ts`
- 생성: `apps/web/src/lib/music/catalog.test.ts`
- 생성: `apps/web/src/components/ems/ems-browser.tsx`
- 생성: `apps/web/src/components/ems/ems-browser.test.tsx`
- 생성: `apps/web/src/app/ems/page.tsx`
- 생성: `apps/web/src/app/search/page.tsx`

**구현**

1. 공개 EMS 표시용 `CatalogTrack` 메타데이터(장르, 무드, 지원 플랫폼)를 기존 `Track`과 구분해 fixture에만 추가한다. 실제 EMS 원본 카탈로그나 외부 API는 연결하지 않는다.
2. 순수 함수 `filterCatalogTracks`를 만들고 키워드·장르·무드·플랫폼 조건을 조합해 공개 카탈로그만 필터링한다.
3. `EmsBrowser`에 검색 입력, 필터 칩, 결과 수, 트랙 카드 그리드를 구현한다. 결과가 없어도 입력·필터를 유지한 빈 상태와 초기화 버튼을 표시한다.
4. `/ems`는 전체 탐색을, `/search`는 검색 입력에 바로 초점을 줄 수 있는 검색 중심 화면을 제공한다. 둘 다 비로그인 사용자에게 열어 둔다.
5. EMS의 재생은 플레이어에 연결할 수 있지만 좋아요·싫어요·개인 제외 상태를 직접 변경하지 않는다.

**검증**

1. `catalog.test.ts`에서 단일 조건, 복수 조건, 대소문자 무시 검색, 결과 없음 케이스를 먼저 실패시킨다.
2. `ems-browser.test.tsx`에서 필터 선택, 결과 수 변경, 결과 없음 초기화, 비로그인 재생 진입을 먼저 실패시킨다.
3. `npm run test -- --run src/lib/music/catalog.test.ts src/components/ems/ems-browser.test.tsx`를 통과시킨다.
4. `/ems`, `/search` 직접 진입과 모바일 필터 가로 스크롤을 브라우저로 확인한다.

**커밋**

`feat(ems): add public catalog browsing and search`

## 작업 4: GMS를 다중 카드 빠른 취향 판단 화면으로 개편

**파일**

- 수정: `apps/web/src/app/gms/page.tsx`
- 수정: `apps/web/src/components/music/preference-actions.tsx`
- 수정: `apps/web/src/components/music/preference-actions.test.tsx`
- 수정: `apps/web/src/lib/music/recommendations.test.ts`

**구현**

1. GMS에 2~4개의 추천 카드를 반응형 그리드로 표시하고, 각 카드에서 재생·좋아요·별로예요·영구 제외를 바로 실행하게 한다.
2. 카드별 액션은 다른 카드의 버튼·포커스를 불필요하게 바꾸지 않고, 처리된 트랙만 다음 후보로 교체하거나 제외 표시한다.
3. 비로그인 사용자는 재생과 추천 이유 열람은 허용하며, 개인화 액션은 기존 `SignInGate`로만 보호한다.
4. `PreferenceActions`의 기존 콜백·접근성 레이블 계약을 유지하고, 영구 제외는 현 세션의 추천 후보에만 반영한다.

**검증**

1. 먼저 테스트에 다중 추천 카드, 각 카드의 독립 액션, 비로그인 게이트, 제외 트랙 비재노출을 추가한다.
2. `npm run test -- --run src/components/music/preference-actions.test.tsx src/lib/music/recommendations.test.ts`를 통과시킨다.
3. 375px에서 한 열, 태블릿 이상에서 다중 열, 키보드 Tab 순서와 Enter/Space 작동을 브라우저로 확인한다.

**커밋**

`feat(gms): support fast multi-track taste decisions`

## 작업 5: MMS를 트랙 목록 중심의 개인 음악 관리 화면으로 개편

**파일**

- 수정: `apps/web/src/app/mms/page.tsx`
- 생성: `apps/web/src/components/music/mms-track-list.tsx`
- 생성: `apps/web/src/components/music/mms-track-list.test.tsx`

**구현**

1. 데스크톱에서는 트랙·아티스트·앨범·추가일·상태·행동을 가진 의미론적 표로, 모바일에서는 동일 정보를 압축한 행 목록으로 렌더링한다.
2. 목록 상단에 검색·정렬·상태 필터와 선택 개수를 제공하며, 제거·재생 같은 현재 지원 액션은 확인 가능한 버튼으로 둔다.
3. 인증되지 않은 사용자는 공개 예시 목록을 볼 수 있지만 수정성 액션은 `SignInGate`로 보호한다.
4. 개인 데이터 저장, 대량 변경 API, 실제 플레이리스트 동기화는 추가하지 않는다.

**검증**

1. 목록 테스트에 열/행 정보, 검색·필터 결과, 재생 진입, 비로그인 수정 게이트를 먼저 추가한다.
2. `npm run test -- --run src/components/music/mms-track-list.test.tsx`를 통과시킨다.
3. 375px에서 행 정보와 버튼이 잘리지 않고, 1024px에서 표 머리글·행의 정렬이 유지되는지 브라우저로 확인한다.

**커밋**

`feat(mms): introduce track-first music management`

## 작업 6: 밝은 TIDAL 연결 온보딩과 게스트 경계를 정리

**파일**

- 수정: `apps/web/src/app/onboarding/page.tsx`
- 수정: `apps/web/src/components/onboarding/tidal-onboarding.tsx`
- 수정: `apps/web/src/components/onboarding/tidal-onboarding.test.tsx`
- 수정: `apps/web/src/components/auth/sign-in-gate.tsx`

**구현**

1. 온보딩을 `연결 안내 → 플레이리스트 가져오기 안내 → 취향 분석 준비`의 세 단계 진행 상태로 표현한다.
2. 실제 OAuth를 수행하지 않는다는 현재 제약을 유지하고, 연결 버튼은 기존 프로토타입 상태 전이만 실행한다.
3. `SignInGate`의 설명과 취소/계속 행동을 밝은 테마에 맞게 정리하며, 차단 뒤에도 사용자가 공개 탐색 화면으로 돌아갈 수 있게 한다.
4. 다이얼로그의 제목, 설명, 닫기 버튼, 초기 포커스, Escape 닫기를 접근 가능하게 유지한다.

**검증**

1. 온보딩 테스트에 세 단계 진행 표시와 완료 상태를, 게이트 테스트에 키보드 닫기와 공개 탐색 복귀를 먼저 추가한다.
2. `npm run test -- --run src/components/onboarding/tidal-onboarding.test.tsx` 및 관련 게이트 테스트를 통과시킨다.
3. 키보드만으로 온보딩과 게이트를 완료·닫기할 수 있는지 브라우저로 확인한다.

**커밋**

`feat(onboarding): clarify tidal connection and guest access`

## 작업 7: 플레이어 완성도와 전체 회귀 검증

**파일**

- 수정: `apps/web/src/components/player/persistent-player.tsx`
- 수정: `apps/web/src/components/player/persistent-player.test.tsx`
- 수정: `apps/web/src/components/player/full-player-dialog.tsx`
- 수정: `apps/web/src/providers/music-session-provider.test.tsx` (필요한 표시 상태 회귀만)
- 수정: `docs/changes/2026-09-20-bright-cinematic-user-interface-implementation.md`

**구현**

1. 고정 플레이어를 밝은 반투명 표면으로 정리하고, 재생/일시정지·다음 곡·전체 플레이어 열기·현재 트랙의 접근 가능한 이름을 보장한다.
2. 전체 플레이어는 모바일과 데스크톱에서 같은 음악 상태를 보여 주며, 다이얼로그 포커스와 닫기 동작을 보존한다.
3. 전역 셸의 하단 여백과 맞추어 모든 라우트에서 고정 플레이어/모바일 내비게이션이 본문을 가리지 않게 조정한다.
4. 변경 기록에 변경 이유, 구현 내용, 실제 성공한 검증 명령, 브라우저 확인 범위, 미검증 항목(실제 TIDAL·서버 영속성)을 한국어로 남긴다.

**검증**

1. 플레이어 테스트에 밝은 테마 변경과 무관한 핵심 재생 상태·다이얼로그 열기/닫기 회귀를 먼저 확인한다.
2. `npm run test`를 실행한다.
3. `npm run lint`를 실행한다.
4. `npm run build`를 실행한다.
5. 375px와 1280px에서 `/`, `/ems`, `/gms`, `/mms`, `/search`, `/onboarding`의 내비게이션·고정 플레이어·다이얼로그를 수동 확인한다.

**커밋**

`feat(ui): complete bright cinematic music experience`

## 완료 기준

- 전역 메뉴의 다섯 경로가 동작하며 데스크톱·모바일에서 현재 위치를 알 수 있다.
- 홈은 짧은 히어로와 풍부한 탐색 레일을 제공하고, EMS와 검색은 비로그인 사용자도 사용할 수 있다.
- GMS는 다중 카드에서 빠르게 취향 액션을 수행하고, MMS는 트랙 목록 중심으로 관리한다.
- 고정 플레이어·전체 플레이어·인증 게이트가 키보드와 모바일에서 사용 가능하다.
- 실제 TIDAL 인증·서버 저장·영구 제외의 영속성은 구현하지 않았음을 변경 기록에 명시한다.
- `npm run test`, `npm run lint`, `npm run build`가 모두 성공한다.
