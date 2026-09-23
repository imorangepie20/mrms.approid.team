# 트랙 카드 레일 스크롤·모션 개선

- 날짜·작업명: 2026-09-23 트랙 카드 레일 스크롤·모션 개선
- 변경 이유: Home·EMS·GMS의 트랙 카드 행에 브라우저 기본 스크롤바가 노출되어 화면이 거칠고, 긴 카드 목록을 이동하는 방법이 명확하지 않았다.
- 변경 내용:
  - 공통 `TrackRail`을 추가해 트랙 카드 레일의 가로 스크롤바를 숨겼다.
  - 좌우 버튼은 보이는 콘텐츠가 더 있을 때만 활성화하고, `scrollBy`의 부드러운 이동으로 한 화면 단위로 이동한다.
  - 레일에 키보드 포커스와 `ArrowLeft`·`ArrowRight`·`Home`·`End` 동작을 추가했다.
  - `prefers-reduced-motion`에서는 즉시 이동으로 전환하며 모바일에서는 기존 터치 스와이프를 유지한다.
  - Home·EMS 에디토리얼·GMS 추천 레일이 같은 컴포넌트와 시각 규칙을 사용하도록 통합했다.
  - 레일 카드의 폭을 고정하고 제목·아티스트·앨범 텍스트를 한 줄로 클램프해 긴 메타데이터가 인접 카드를 밀어내지 않도록 했다.
- 검증:
  - `apps/web`: TrackRail focused test 2개 통과
  - `apps/web`: 전체 Vitest 84개 파일·339개 테스트 통과
  - 변경 파일 ESLint 통과
  - Impeccable detector 지적 0건
  - `npm run build` 성공
  - `git diff --check` 성공(기존 CRLF 경고만 존재)
- 미검증·제약:
  - 운영 브라우저에서의 실제 드래그·터치 감각은 별도 시각 QA가 필요하다.
- 다음 작업: 데스크톱·모바일 운영 화면에서 레일 버튼과 카드 포커스 순서를 확인한다.

## 운영 배포

- 커밋 `d31d5c3`를 `origin/codex/ems-artwork-2k`에 푸시했다.
- Zorin release `/home/approid/apps/music-pie/releases/d31d5c3`를 생성하고 `music-pie-web:current` 이미지를 빌드했다.
- Web 컨테이너 health와 로컬·공개 `/`, `/ems`, `/gms`, `/api/health/ready`가 모두 HTTP 200이며, 비로그인 `/api/recommendations`는 HTTP 401이다.
- GMS 추천 레일 확장 커밋 `5716f48`도 같은 절차로 Zorin release에 배포했고, 현재 release symlink는 `/home/approid/apps/music-pie/releases/5716f48`이다.
