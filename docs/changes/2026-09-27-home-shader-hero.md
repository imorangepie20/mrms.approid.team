# Home 셰이더 히어로

## 이유

Home 첫 화면을 [21st.dev `reuno-ui/hero`](https://21st.dev/community/components?preview=%2F%40reuno-ui%2Fcomponents%2Fhero)의 유기적인 셰이더 방향으로 바꾸되 Music Pie의 실제 관리자 콘텐츠와 EMS 진입 흐름을 유지한다.

## 변경

- 잠긴 예제 소스는 복사하지 않고 공식 [Paper Shaders](https://github.com/paper-design/shaders)의 React `MeshGradient` 공개 API로 Home 전용 배경을 구현했다.
- `@paper-design/shaders-react`는 `0.0.67`로 정확히 고정했다. 청록, 짙은 녹청, 주황, 올리브, 자주색을 섞어 기존 단색 보라 중심 표현을 교체했다.
- 관리자 `home_content`의 hero 제목, 본문, 링크는 그대로 사용한다. hero 뒤의 서비스 개념, 이용법, 실제 EMS 선곡과 음악 이야기 순서도 바꾸지 않았다.
- WebGL이 없거나 셰이더 초기화 전이어도 같은 색 구성의 CSS 배경이 즉시 보인다. 셰이더 캔버스는 보조 기술에서 숨겼고 `prefers-reduced-motion`에서는 속도를 0으로 둔다.
- 데스크톱은 448px, mobile은 최소 430px 높이로 제한해 첫 화면 아래 콘텐츠의 시작이 보이게 했다. 제목과 본문에는 긴 문자열 줄바꿈을 적용하고 CTA는 44px 높이와 focus outline을 유지한다.
- `390x844` 운영 확인에서 발견한 기존 상단 겹침을 함께 수정했다. mobile 검색은 왼쪽, 인증 동작은 오른쪽에 두고 계정명만 말줄임하며 페이지 제목을 독립된 다음 행으로 내려 모든 동작을 유지한다.
- Home 테스트의 콘텐츠 mock을 실제 `/api/home/content` 배열 응답과 EMS section 응답으로 분리해 동적 hero 회귀를 검증한다.

## 검증

- `npm test -- --run src/app/page.test.tsx`: 3/3 통과. jsdom의 기존 `HTMLMediaElement.play()` 미구현 안내만 출력됐다.
- 변경 TypeScript 3개 파일 대상 ESLint 통과.
- `npm run build`: Next.js production build와 TypeScript 통과.
- `npm audit --omit=dev`: production dependency 취약점 0건.
- 전체 `npm test`: 393건 중 390건 통과. 이번 Home 경로와 무관한 기존 likes·recommendations API 테스트 3건은 인증 의존성에서 예상 `200/204` 대신 `503`을 받아 실패했다.
- `git diff --check` 통과.

## 운영 경계

- DB migration과 데이터 write는 없다.
- 사용자 데이터, active EMS catalog, embedding과 EMS worker 설정은 변경하지 않는다.
- 비밀값, token, signed URL과 raw query는 코드·로그·문서에 기록하지 않는다.

## 배포·롤백

- 배포와 public browser 검증 뒤 실제 release, image, 이전 rollback 식별자를 추가한다.

## 미검증·다음 작업

- 로컬 production server는 운영 DB에 연결되지 않아 실제 관리자 hero 콘텐츠를 브라우저에서 렌더하지 못했다. 배포 뒤 public Home의 셰이더와 desktop·`390x844` 배치를 검증한다.
