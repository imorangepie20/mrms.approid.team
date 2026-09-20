# 현재 개발 상태

최종 갱신: 2026-09-21

## 이번 목표

TIDAL 검색 결과를 공통 트랙 목록으로 표시하고 전역 플레이어에서 재생한다. 셔플·반복·볼륨·음소거·탐색과 대기열 상태를 페이지 이동 중에도 유지한다.

## 현재 구현

- `apps/web`에 Next.js 기반 사용자 화면, Auth0 인증, TIDAL 검색·플레이리스트·재생 API가 구현되어 있다.
- 검색 결과는 통합 결과, 트랙, 앨범, 플레이리스트 탭으로 구성된다.
- 검색·EMS·MMS 트랙 목록은 공통 `TrackList`를 사용한다.
- 전역 재생 세션은 큐, 이전/다음, 셔플, 전체/한 곡 반복, 볼륨, 음소거, 재생 위치를 관리한다.
- 공개 주소는 `https://mrms.approid.team/`, production 서버 포트는 `44119`다.
- 초기 개인화 추천 전략과 사용자별 영구 제외 규칙은 기존 결정 문서를 따른다.

## 검증 결과

| 날짜 | 작업 디렉터리·명령 또는 수동 절차 | 성공 조건 | 결과 |
|---|---|---|---|
| 2026-09-20 | 생성 문서의 경로·링크·템플릿 확인 | `AGENTS.md`가 가리키는 4개 문서와 작업·변경 템플릿이 존재함 | 통과: 7개 필수 문서의 존재, `AGENTS.md` 참조, 템플릿 표식 확인 |
| 2026-09-20 | 수정된 하네스 안내와 작업·변경 템플릿 대조 | 조사 근거·직접 검증·미정 항목을 기록할 수 있음 | 통과: 필수 문서 7개, `AGENTS.md` 참조, 추가 템플릿 항목 확인 |
| 2026-09-21 | `apps/web`: `npm test` | 전체 회귀 통과 | 통과: 41개 파일, 129개 테스트 |
| 2026-09-21 | `apps/web`: `npm run lint` | ESLint 오류 없음 | 통과 |
| 2026-09-21 | `apps/web`: `npm run build` | production build와 TypeScript 통과 | 통과 |
| 2026-09-21 | 공개 도메인 브라우저 확인 | 검색·재생 선택·셔플 상태·현재 대기열 표시 | 통과 |
| 2026-09-21 | 공개 도메인 TIDAL 재생 확인 | 재생 시간 증가와 미디어 오류 없음 | 통과: `paused: false`, `readyState: 4`, `errorCode: null` |

## 미검증·제약

- fixture 기반 EMS·MMS 트랙에는 `tidalTrackId`가 없어 실제 스트리밍 대상이 아니다.
- 앨범·플레이리스트 클릭 동작과 저장 정책은 아직 확정하지 않았다.

## 다음 작업

1. 실제 모바일 기기에서 TIDAL 오디오 출력을 확인한다.
2. 앨범·플레이리스트 클릭 시 상세 화면 또는 재생 동작을 결정한다.
3. 플레이리스트 선택·저장과 연결 해제 후 데이터 유지 정책을 구현한다.
4. ISRC·MusicBrainz 보강과 앨범 이미지 저장 정책을 설계한다.

## 관련 문서

- `docs/harness/portable-project-harness.md`
- `AGENTS.md`
- `docs/project-rules/core-principles.md`
- `docs/project-rules/doc-access-order.md`
- `docs/decisions/2026-09-20-personalized-recommendation-baseline.md`
- `docs/decisions/2026-09-20-admin-template-runtime.md`
- `docs/plans/2026-09-21-shared-track-list.md`
- `docs/changes/2026-09-21-shared-track-list-playback.md`
