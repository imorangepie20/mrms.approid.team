# 통합 취향 분석 문서와 관리자 화면 연결 변경 기록

## 변경 이유

기존 TIDAL 플레이리스트·메타데이터·좋아요·GMS 결정 기반 취향 분석과 30초 프리뷰 오디오 분석안을 한 기준에서 확인할 문서가 없었다. 현재 동작과 향후 오디오 확장을 구분해 기록하고 관리자가 운영 화면에서 같은 내용을 열람할 수 있도록 연결했다.

## 변경 내용

- `docs/overview/taste-analysis-system.md`를 통합 기준 문서로 추가했다.
  - 현재 입력, 텍스트 임베딩, 가중치, 군집, 추천 점수와 싫어요 처리 경계를 기록했다.
  - 30초 프리뷰의 10초 3구간 분석, 리듬·에너지·음색·화성·보컬·악기·분위기·제작 지표를 정리했다.
  - 텍스트·오디오 결합 점수, fallback, 처리 자원, 데이터 상태 모델과 단계별 도입 순서를 제안 상태로 구분했다.
- 관리자 앱에 `/admin/taste-analysis` 읽기 전용 화면을 추가했다.
  - `추천·취향 → 취향 분석 설계` 사이드바 메뉴에서 진입한다.
  - 현재 구현과 오디오 확장 제안을 상태 배지로 구분한다.
  - 작은 화면에서 카드가 단일 열로 바뀌고 표와 수식만 내부 가로 스크롤을 사용하도록 구성했다.
- 라우트·메뉴·핵심 문서 섹션 연결을 확인하는 회귀 테스트를 추가했다.
- 문서 인덱스의 개인화 추천·GMS 영역에 통합 문서 링크를 추가했다.

## 검증 결과

- `apps/admin`: `npm test -- src/pages/TasteAnalysis.test.ts` 성공, 1개 파일·2개 테스트 통과
- `apps/admin`: `npm test` 성공, 4개 파일·9개 테스트 통과
- `apps/admin`: `npm run lint` 성공, 오류 0건
  - 기존 관리자 템플릿의 미사용 import 등 경고 38건은 남아 있으며 이번 추가 화면에서 발생한 경고는 없다.
- `apps/admin`: `npm run build` 성공, TypeScript와 Vite production bundle 생성
- `apps/web`: `npm run build` 성공, `/admin/[[...slug]]`를 포함한 Next.js production build 생성
- 저장소 루트: `git diff --check` 성공
- 기능 커밋 `eee723f`를 `origin/codex/anonymous-playback-error`에 push하고 Zorin release `/home/approid/apps/music-pie/releases/eee723f`로 배포했다.
- 운영 Web image `sha256:60ec9e3e5485...`를 빌드하고 Web 컨테이너만 재생성했다. 직전 image `sha256:794afa16307a...`는 `music-pie-web:pre-taste-analysis-eee723f`로 보존했다.
- local/public `/`, `/ems`, `/gms`, `/search`, `/api/health/live`, `/api/health/ready`는 모두 HTTP 200이다.
- 비로그인 local/public `/admin/taste-analysis`는 인증 경계에 따라 HTTP 307이고 새 관리자 asset은 HTTP 200이다. 배포 asset에서 `통합 취향 분석 설계` 문구를 확인했다.
- Web은 healthy이고 최근 10분 오류 로그는 0건이다. PostgreSQL, embedding, EMS pipeline, EMS source routines, tunnel의 container ID와 시작 시각은 배포 전후 동일하다.

## 미구현·미검증 항목

- 30초 프리뷰 수집, 오디오 디코딩, 특징·임베딩 계산, DB 저장과 결합 추천은 설계만 기록했으며 런타임에는 적용하지 않았다.
- 실제 로그인 관리자 브라우저에서의 메뉴 이동과 desktop/mobile 시각 검증은 아직 하지 않았다.
- 관리자 번들은 기존과 같이 단일 JavaScript chunk가 500kB를 넘는 Vite 경고가 남는다.

## 다음 작업

1. 프리뷰 hash와 분석 상태 계약을 확정하고 bounded audio worker를 구현한다.
2. 트랙별 오디오 분석 상태·지표·실패 원인을 관리자 API와 화면에 연결한다.
3. shadow 모드에서 텍스트 추천과 오디오 추천의 순위·coverage를 비교한 뒤 결합 가중치를 고정한다.
