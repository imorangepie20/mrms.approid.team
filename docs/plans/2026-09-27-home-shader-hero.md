# Home 셰이더 히어로 계획

## 목표

- Home 상단을 `21st.dev`의 `reuno-ui/hero`가 보여 주는 유기적 셰이더 분위기로 재구성한다.
- 관리자 `home_content`가 제공하는 제목, 본문, 링크를 그대로 사용하고 실제 EMS 선곡과 이하 콘텐츠 순서는 유지한다.
- 데스크톱과 `390x844` 화면에서 다음 콘텐츠의 시작이 보이며 키보드와 감속 모드를 지원한다.

## 변경 범위

- `apps/web/src/components/dashboard/home-shader-hero.tsx`: 셰이더 배경과 Home 전용 히어로 표현을 분리한다.
- `apps/web/src/components/dashboard/music-dashboard.tsx`: 기존 고정 음반 장식을 새 히어로로 교체한다.
- `apps/web/src/app/styles/dashboard.css`, `apps/web/src/app/styles/responsive.css`: 레이아웃, 대비, 모바일 배치와 감속 모드를 정의한다.
- `apps/web/package.json`, `apps/web/package-lock.json`: `@paper-design/shaders-react`를 정확한 버전으로 고정한다.
- Home 렌더링 테스트에 동적 콘텐츠와 보조 진입점 회귀 검증을 추가한다.

## 구현 순서

1. 공식 Paper Shaders React 패키지의 `MeshGradient` API와 현재 React/Next.js 호환성을 타입 검사로 확인한다.
2. 셰이더 캔버스는 장식으로 숨기고, CSS 대체 배경 위에 관리자 콘텐츠와 EMS 보조 진입점을 배치한다.
3. 작은 화면에서는 높이와 문장 폭을 줄이고 CTA를 줄바꿈한다. `prefers-reduced-motion`에서는 셰이더 속도를 0으로 만든다.
4. Home 단위 테스트, ESLint, production build와 데스크톱·`390x844` 브라우저 화면을 검증한다.
5. 커밋과 push 뒤 Web만 배포하고 public Home·readiness와 기존 EMS 컨테이너 불변을 확인한다.

## 완료 기준

- Home 첫 화면에 유기적 셰이더 배경, 실제 관리자 제목·본문·기본 CTA가 함께 보인다.
- 셰이더가 실행되지 않아도 텍스트와 CTA가 읽히고 사용할 수 있다.
- 작은 화면에서 가로 overflow나 텍스트·버튼 겹침이 없다.
- 실제 EMS 선곡과 이하 Home 콘텐츠가 유지된다.
- 비밀값, token, signed URL, 사용자 데이터와 DB 변경이 없다.

## 롤백

- 배포 전 release symlink와 Web image를 식별해 보존한다.
- 문제가 있으면 이전 release와 Web image만 되돌린다. DB, EMS pipeline, source routines는 변경하지 않는다.
