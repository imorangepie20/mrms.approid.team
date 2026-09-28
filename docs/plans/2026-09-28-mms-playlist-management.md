# MMS 내부 플레이리스트 관리 구현 계획

## 목표

승인된 `docs/superpowers/specs/2026-09-28-mms-playlist-management-design.md`에 따라 사용자별 내부 플레이리스트 CRUD와 트랙 추가·제거·순서 변경을 구현한다. 가져온 TIDAL 플레이리스트, EMS 원본, 좋아요와 다른 사용자 데이터는 변경하지 않는다.

## 구현 순서

1. `apps/web/src/lib/db/migrations/022_mms_playlists.sql`과 down/test를 추가한다.
   - `mms_playlists`, `mms_playlist_tracks`와 사용자·항목 cascade, 중복·순서 제약, 조회 인덱스를 정의한다.
2. `apps/web/src/lib/mms/playlists.ts`에 공개 타입과 이름·설명·트랙·정렬 입력 parser를 추가한다.
   - API와 클라이언트가 같은 오류 코드·길이·URL·식별 규칙을 사용한다.
3. `apps/web/src/lib/db/mms-playlists.ts`와 단위 테스트를 추가한다.
   - 모든 query를 Auth0 `sub`로 범위 제한하고 생성·수정·삭제·트랙 추가·제거·재정렬을 구현한다.
   - 여러 query가 필요한 항목 변경은 transaction으로 처리한다.
4. `apps/web/src/app/api/mms/playlists/**` Route Handler와 테스트를 추가한다.
   - Next.js 16의 비동기 dynamic params를 사용한다.
   - 인증, 입력 오류, 소유권 불일치, 중복, 서버 오류를 설계의 HTTP 상태로 변환한다.
5. `apps/web/src/components/music/add-to-playlist-button.tsx`와 테스트를 추가한다.
   - 트랙별 플레이리스트 선택, 중복 안내, 인라인 생성, 비로그인 안내, 요청 중 상태를 제공한다.
6. `TrackList`, `TrackCard`, GMS 전용 트랙 행에 추가 진입점을 연결한다.
   - 기존 재생·좋아요 동작과 독립적으로 동작하는지 회귀 테스트한다.
7. `apps/web/src/components/music/mms-library.tsx`, `apps/web/src/app/mms/page.tsx`와 테스트를 확장한다.
   - 내부 플레이리스트 목록·생성, 상세, 메타데이터 수정, 삭제 확인, 트랙 제거·위/아래 이동, 전체 재생·셔플을 구현한다.
8. `apps/web/src/app/styles/dashboard.css`와 `responsive.css`를 기존 토큰으로 확장한다.
   - 대화상자, 카드, 상세 관리 버튼의 키보드·모바일 상태를 확인한다.
9. `docs/changes/2026-09-28-mms-playlist-management.md`와 현재 개발 상태를 실제 결과에 맞게 갱신한다.

## 의존 관계

- migration과 입력 타입이 DB repository보다 먼저 필요하다.
- DB repository와 parser가 API보다 먼저 필요하다.
- 목록·상세 API가 UI보다 먼저 필요하다.
- 공통 트랙 추가 컴포넌트를 먼저 만든 뒤 각 화면에 연결한다.
- 운영 migration과 배포는 이번 구현 범위에 포함하지 않는다.

## 검증

1. 신규 migration·parser·DB·API·컴포넌트 관련 Vitest
2. `npm test`
3. `npm run lint`
4. `npm run build`
5. 저장소 루트 `git diff --check`

## 완료 기준

- 사용자별 내부 플레이리스트 생성·조회·수정·삭제가 가능하다.
- 모든 주요 트랙 UI에서 내부 플레이리스트에 트랙을 추가할 수 있다.
- 상세에서 트랙 제거·순서 변경·전체 재생·셔플이 가능하다.
- 중복·인증·소유권·삭제 경계가 테스트로 고정된다.
- 실제 성공한 검증과 미검증 항목을 변경 기록에 남긴다.
