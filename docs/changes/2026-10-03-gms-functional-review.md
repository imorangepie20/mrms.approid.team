# GMS 전체 기능 재점검 결과

후속 상태: 아래는 수정 전 점검 기록이다. 사용자 추가 수정 요청으로 세 결함을 로컬 수정하고 [수정 검증 결과](2026-10-03-gms-functional-fixes.md)에 기록했다. 운영 미배포다.

## 기준과 판정

- 요청: GMS 모든 기능 재점검. HEAD `4aabdd9`, 계획 `docs/plans/2026-10-03-gms-functional-review.md` 기준.
- 운영 대상: `https://mrms.approid.team/gms`, `/gms/history`, `/mms`의 기존 로그인 Chrome.
- 첫 검증: PASS 6개, FAIL 3개. 기능 전체 정상 또는 완료로 판정할 수 없다.
- 사용자 제공 완료 게이트 4항(첫 검증의 FAIL/UNVERIFIED 합계가 3개 이상이면 개별 수정을 중단)에 따라 제품 소스 수정·배포는 하지 않았다.
- 가장 앞선 원인 계층은 기능 계약을 UI·API·저장소·MMS 조회에 연결하고 통합 시나리오로 검증하는 단계다. 기존 테스트는 API 호출과 로컬 상태 변경을 확인하지만 저장 결과·목록 동기화·MMS 재조회까지 연결하지 않는다. 이 판단은 아래 재현과 소스에 근거한 분석이다.

## 결함

### 결정 저장 결과와 화면 동기화 누락

- `apps/web/src/components/dashboard/music-dashboard.tsx:71`의 `persistDecision`은 HTTP 상태를 검사하지 않고 fetch rejection도 무시한다. API 완료 전에 로컬 `acceptTrack`/`rejectTrack`을 호출한다.
- 화면은 제공 `tracks` 그대로를 사용한다. 결정 후 행 제거·대기 수 갱신·router refresh가 없고, 처리 중 수락/거절 중복도 막지 않는다.
- 재현 테스트 3개 모두 실패했다: HTTP 503에도 accept 호출 1회, 성공한 reject 후 재생 버튼 잔존, pending accept와 reject 요청 2회.
- 결정 API의 부분 성공 `503 {decisionSaved:true}`도 UI가 구분하지 않는다.

### `+ MMS`와 MMS 영속 조회 연결 누락

- `apps/web/src/lib/db/gms-recommendations.ts:858`은 결정 table에만 INSERT한다. 수락으로 좋아요나 내부 playlist를 만들지 않는다.
- 로컬 accept는 `musicState`를 변경하지만 `apps/web/src/app/mms/page.tsx:23`은 가져온/내부 playlist만 조회하고 `mms-library.tsx:91`은 좋아요를 표시한다. 수락 이력이나 로컬 `mmsTrackIds`의 표시 경로가 없다.
- 기존 운영 이력의 `Cornet Chop Suey`는 `MMS로 보냄`인데 MMS에는 이 곡 표시 0건, 좋아요 트랙 0개, 내부 playlist 0개다. 이번 점검에서 수락 버튼을 누르지 않았다.
- 기존 계약상 좋아요와 추천 수락은 별개다. 하트를 자동 저장하는 것으로 대체하면 안 된다.

### 모바일 추천 이력 가독성 실패

- `390×844`에서 `Cornet Chop Suey` 재생 버튼 폭 29.359375px, 제목 요소 폭 39.6875px다. 코드의 artwork는 44px이며 screenshot에서 제목 `Cor…`과 여러 줄로 쪼개진 결정 label을 확인했다.
- `apps/web/src/components/music/track-list.tsx:57`은 추가 액션이 있으면 작업 열을 208px(`w-52`)로 고정하고 모바일에도 아티스트 25%·번호 열을 유지한다.
- body 가로 overflow가 0이어도 제목 가독성은 실패다. GMS 본문은 11행·가로 overflow 0·action 우측 잘림 0이며 문제는 이력 공통 테이블이다.

## 검증 체크

| 체크 | 상태 | 실제 증거 |
|---|---|---|
| 1. 접근·상태 | PASS | page/API/access-policy 기존 테스트 통과. 운영 지원 API 6개 비인증 401; 미지원 history GET 405 |
| 2. 추천 제공·격리·batch·coverage | PASS | serving·filters·batch를 포함한 기존 GMS 집중 검증 24개 파일·120개 테스트 통과, exit 0. 신선한 운영 11곡 snapshot reload 전후 순서 동일 |
| 3. 결정·좋아요·분석 액션 | FAIL | 기존 like/add-to-playlist/audio-profile/analyze 테스트 통과. 추가 결정 재현 3개 실패, exit 1: 저장 실패·성공 동기화·중복 보호 누락 |
| 4. 이력 데이터·삭제 계약 | PASS | history page/API/repository/list 테스트에서 소유권·멱등·확인/취소·실패 보존·snapshot/exposure 보존 확인. 운영 총 2회·20곡·삭제 버튼 20개와 결정 label 확인 |
| 5. 격리 DB 통합 | PASS | 전용 pgvector DB migration 31개 apply exit 0. shadow 추천·audio taste profile 통합 2개 파일·2개 테스트 통과, skip 0, exit 0 |
| 6. 운영 브라우저 | PASS | `Fine and Mellow` 재생 위치 0:15→1:32→2:18, 길이 8:01. 이력·MMS 이동 뒤 전역 재생 유지. 추가 메뉴 로드·Escape 닫기. console error/warning 0 |
| 7. 키보드·모바일 | FAIL | Escape 닫기·GMS 본문 잘림 0. 모바일 이력 버튼 29.36px/제목 39.69px 및 label 붕괴 screenshot |
| 8. 전체 회귀·정적 검사 | PASS | 기존 Web 142개 파일·554개 테스트 통과, DB 조건부 3개 skip. lint 오류 0·기존 경고 6, exit 0. build·TypeScript·52개 route, exit 0. diff check exit 0 |
| 9. 수락→MMS 영속 조회 | FAIL | 운영 이력의 수락 label과 MMS 표시 0건 대조. 결정 INSERT와 MMS 조회·render 연결 경로 없음 |

## 실행·재현 근거

`apps/web`에서 실행:

```powershell
npm test
npm run lint
npm run build
npm test -- src/app/gms src/app/api/recommendations src/lib/recommendations src/lib/db/gms src/components/recommendations src/components/dashboard/music-dashboard.test.tsx src/components/music/like-button.test.tsx src/components/music/add-to-playlist-button.test.tsx src/providers/music-session-provider.test.tsx src/lib/embeddings/jobs.test.ts
npm test -- src/lib/db/gms-recommendations.postgres.test.ts src/lib/db/audio-taste-profiles.postgres.test.ts
```

- 통합 환경 변수: `RECOMMENDATION_SHADOW_TEST_DATABASE_URL`, `AUDIO_TASTE_PROFILE_TEST_DATABASE_URL`. 운영 DB가 아닌 새 전용 DB를 사용했다.
- 첫 통합 실행은 audio 변수 오기로 1개 skip, 다음 실행은 이전 fixture 잔존으로 중복 PK 오류였다. 전용 public schema를 초기화하고 migration 31개와 통합 2개를 다시 실행해 통과했다. 초기 두 실행은 통과로 기록하지 않는다. 이 테스트들은 fixture를 자체 정리하지 않아 빈 DB가 필요하다.
- 최초 HTTP probe는 DELETE만 제공되는 history GET에 401을 기대해 중단됐다. 구현을 확인해 기대값을 405로 바로잡았다. 미지원 GET의 405는 제품 결함이 아니다.
- 증거 폴더: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/gms-review/`.
- screenshot: `gms-desktop.png`, `gms-mobile.png`, `gms-history-mobile.png`.
- 재현: `gms-functional-review.repro.test.tsx`, SHA-256 `B74EAA722FDC8678F44D3B53E48A756794FC7AFA050262611B548E826741091A`; `gms-decision-repro.log`에 exit 1·3개 실패 기록.
- 재현 파일을 `apps/web/src/components/dashboard/`에 복사하고 `npm test -- src/components/dashboard/gms-functional-review.repro.test.tsx`로 재현한다. 진단 뒤 복사한 파일만 제거한다. 이번 임시 테스트는 저장소에서 제거했고 제품 소스는 보존했다.

## 미검증·다음 작업

- 실계정의 batch 생성·영구 거절·삭제·좋아요/playlist 저장·프로필 재계산은 실행하지 않았다. 해당 경로는 자동 테스트와 기존 데이터 대조로 검증했다.
- 실제 iOS/Android·Safari/Firefox는 사용 가능한 Chrome 범위 밖이다.
- 전체 suite에서 skip된 3개 중 GMS 관련 PostgreSQL 2개는 별도 통과했다. admin audio PostgreSQL 1개는 GMS 범위 밖이라 미실행이다.
- 처음 오래 열린 GMS는 12곡, reload 뒤 11곡이었다. 이력에 첫 곡의 accept가 이미 존재하며 이번에 그 버튼을 누르지 않았다. 변경 시점은 미확인이다. 이후 신선한 11곡 snapshot reload는 동일했다.
- 운영 재생은 확인 후 일시 정지했고 임시 viewport는 원복했다. 생성 때의 ID·이름·이미지를 대조한 임시 DB 컨테이너 `music-pie-gms-review-20261003`을 제거했고 잔존 0개를 확인했다.
- 다음: 결정의 성공·실패·부분 성공·중복과 수락 트랙의 MMS 표시 계약을 통합 시나리오로 확정하고, 모바일 이력 공간 요구까지 수정 계획에 반영한 뒤 9개 체크 전체를 재실행한다.
