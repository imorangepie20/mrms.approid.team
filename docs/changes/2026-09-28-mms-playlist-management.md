# MMS 내부 플레이리스트 관리 구현

## 변경 이유

사용자가 가져온 TIDAL 플레이리스트와 좋아요를 보는 데 그치지 않고, music-pie 내부에서 자신의 플레이리스트를 직접 만들고 트랙을 구성할 수 있어야 했다. TIDAL 원격 쓰기 권한과 기존 가져오기 동기화 모델을 변경하지 않기 위해 내부 플레이리스트를 별도 사용자 데이터로 분리했다.

## 변경 내용

- `022_mms_playlists.sql`에 `mms_playlists`, `mms_playlist_tracks`를 추가했다.
  - `app_users` 소유권과 cascade 삭제를 적용했다.
  - 플레이리스트별 트랙 중복과 position 충돌을 unique constraint로 차단했다.
  - 순서 변경 transaction을 위해 position constraint를 deferrable로 정의했다.
- `src/lib/mms/playlists.ts`에 이름·설명·트랙 스냅샷·전체 순서 입력 검증과 공개 타입을 추가했다.
- `src/lib/db/mms-playlists.ts`에 사용자 범위 목록·상세·생성·수정·삭제와 트랙 추가·제거·재정렬을 구현했다.
- `/api/mms/playlists` 이하 Route Handler를 추가했다.
  - 인증 없음 `401`, 잘못된 입력 `400`, 다른 사용자 소유 또는 없는 자원 `404`, 중복 트랙 `409`를 반환한다.
  - 다른 사용자의 플레이리스트 존재 여부를 노출하지 않는다.
- 공통 `AddToPlaylistButton`을 추가하고 `TrackList`, `TrackCard`, GMS 전용 트랙 행에 연결했다.
  - 기존 플레이리스트 선택, 이미 포함된 트랙 표시, 인라인 플레이리스트 생성, 비로그인 안내를 제공한다.
- MMS에 `내 플레이리스트` 섹션을 가져온 TIDAL 플레이리스트보다 먼저 표시한다.
  - 생성, 이름·설명 편집, 삭제 확인, 상세 조회, 전체 재생, 셔플을 제공한다.
  - 상세에서 트랙 제거와 키보드·모바일에서 사용할 수 있는 위·아래 순서 이동 버튼을 제공한다.
- 대화상자와 내부 상세의 데스크톱·모바일 스타일을 기존 토큰으로 추가했다.
- 기존 추천 결정·좋아요 API 테스트가 취향 프로필 갱신 의존성을 mock하지 않아 실제 DB 경로로 빠지던 테스트 하네스를 보정했다. 제품 동작은 변경하지 않았다.

## 데이터·권한 경계

- TIDAL 원격 플레이리스트에는 쓰기 요청을 보내지 않는다.
- `user_playlists`, `user_playlist_tracks`, `music_tracks`, `ems_tracks`, `user_likes`를 내부 플레이리스트 삭제 대상으로 사용하지 않는다.
- 내부 플레이리스트와 항목만 현재 Auth0 사용자의 `app_users.id` 범위에서 변경한다.
- TIDAL 트랙은 `tidal:{tidalTrackId}`, 그 밖의 트랙은 `catalog:{sourceId}`를 중복 판정 키로 사용한다.

## 검증 결과

- 기능 관련 Vitest: 12개 파일, 52개 테스트 통과
- MMS 상세 추가 수정 후 직접 Vitest: 1개 파일, 9개 테스트 통과
- 전체 `npm test`: 116개 파일, 450개 테스트 통과
- `npm run lint`: 오류 0개, 기존 경고 5개
- `npm run build`: Next.js 16.3.5 production build와 TypeScript 통과, 신규 MMS API route 5개 확인
- 저장소 `git diff --check`: 통과
- 기능 커밋: `7431f14`

## 미검증·미적용

- `022_mms_playlists.sql`을 실제 개발·운영 PostgreSQL에 적용하지 않았다.
- 로그인된 실제 계정에서 생성·편집·삭제·트랙 추가·제거·순서 이동을 브라우저로 확인하지 않았다.
- 실제 모바일 기기의 대화상자와 긴 트랙 목록 조작은 확인하지 않았다.
- 운영 image build, 배포, 공개 주소 smoke test는 수행하지 않았다.

## 다음 작업

1. 대상 환경을 확정한 뒤 rollback 자료를 준비하고 migration runner로 `022_mms_playlists.sql`을 적용한다.
2. 로그인된 계정에서 검색·EMS·GMS·MMS의 트랙 추가와 MMS CRUD를 데스크톱·모바일로 확인한다.
3. 검증 통과 후 별도 승인 범위에 따라 운영 image build와 배포를 수행한다.
