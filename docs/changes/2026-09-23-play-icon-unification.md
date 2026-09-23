# 플레이 아이콘 통일

- 날짜·작업명: 2026-09-23 플레이 아이콘 통일
- 변경 이유: GMS 추천 카드와 일반 트랙 카드가 서로 다른 CSS 삼각형·SVG 아이콘을 사용해 재생 컨트롤의 모양과 크기가 일관되지 않았다.
- 변경 내용:
  - 공통 `PlayIcon` SVG 컴포넌트를 추가했다.
  - GMS 추천 카드와 `TrackCard`가 같은 아이콘 구조와 16px 시각 크기를 사용하도록 통일했다.
  - 기존 CSS border 삼각형을 제거하고 SVG `currentColor`로 색상을 상속하게 했다.
  - GMS가 별도 Gateway 마크업을 사용해 공통 아이콘만으로는 외형 변화가 작았던 원인을 확인하고, 두 카드 모두 `cover-play-button` 공통 스타일(40px 원형·그림자·hover/focus·모바일 표시)을 사용하도록 연결했다.
  - 재생 버튼의 aria-label과 클릭 동작은 변경하지 않았다.
- 검증:
  - 관련 Vitest 2개 파일·10개 테스트 통과
  - 전체 Vitest 84개 파일·339개 테스트 통과
  - 변경 파일 ESLint 통과
  - `npm run build` 성공
  - Impeccable detector 지적 0건
  - `git diff --check` 성공
- 미검증·제약:
  - 운영 브라우저에서 hover/focus의 실제 시각 감각은 배포 후 확인이 필요하다.

## 운영 배포

- 커밋 `fa3d121`을 `origin/codex/ems-artwork-2k`에 푸시하고 Zorin release `/home/approid/apps/music-pie/releases/fa3d121`에 배포했다.
- GMS 전용 버튼 스타일 연결 수정 커밋 `f9443da`를 추가 배포했고, 현재 release symlink는 `/home/approid/apps/music-pie/releases/f9443da`이다.
- Web health와 로컬·공개 `/`, `/ems`, `/gms`, `/api/health/ready`가 HTTP 200이며, 비로그인 `/api/recommendations`는 HTTP 401이다.
