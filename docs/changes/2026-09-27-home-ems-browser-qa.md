# Home·EMS 배포 브라우저 QA

## 변경 이유

- editorial section release 뒤 남아 있던 Home top 3와 EMS 전체 section의 데스크톱·모바일 시각 및 상호작용 검증을 마무리한다.
- 운영 장애를 만들지 않고도 검색 오류 문구를 반복 검증할 수 있도록 `EmsBrowser` 회귀 테스트를 한 건 보강한다.

## 배포 상태 기준

- QA 시작 release: `afde992cbbff`.
- 공개 대상: `https://mrms.approid.team/`, `https://mrms.approid.team/ems`.
- 운영 DB write, 로그인, 좋아요, 사용자 데이터 변경은 0건이다.
- QA 전 rollback 기준은 이전 release `bc47ed34e971`, Web tag `music-pie-web:rollback-f73b37b6321e`, EMS tag `music-pie-ems-pipeline:rollback-a8a84e4716c3`이다.
- 상시 EMS worker와 source-routines는 재시작하지 않는다.

## 운영 API와 화면

| 항목 | 결과 |
|---|---|
| `totalCount` | API와 EMS hero 모두 `38,762` |
| Home section | `new-releases`, `seasonal-jazz`, `night-rnb` 3개, 각 12곡 |
| EMS section | 위 3개와 `feel-good`, `focus`까지 5개, 각 12곡 |
| section 곡 무결성 | 60곡, 고유 60곡, 전역 중복 0건 |
| 제거된 filter | Spotify·Apple Music control/text 0건 |
| 브라우저 console | warning/error 0건 |

## 데스크톱 검증

- Home은 상위 3개 rail만 표시하고 `feel-good`, `focus`는 표시하지 않았다. EMS는 5개 rail을 모두 표시했다.
- 기본 desktop viewport에서 rail은 `clientWidth 985`, `scrollWidth 2736`이고 문서 전체 가로 overflow는 0이었다.
- 첫 rail은 focus를 유지했고 outline은 `2px solid rgb(192, 132, 252)`로 보였다. `Home=0`, `ArrowRight=808`, `End=1751(max 1751)`로 이동했고 끝에서 이전 control은 활성, 다음 control은 비활성이었다.
- 실제 Home 트랙을 keyboard activation하자 전역 player의 current track이 바뀌고 `로그인 후 재생할 수 있습니다.`와 `returnTo=%2F` 링크가 나타났다. 내부 `unauthorized` 문자열은 노출되지 않았다.

## `390x844` 모바일 검증

- Home 3개, EMS 5개 section과 각 12곡이 유지됐고 문서 전체 가로 overflow는 0이었다.
- rail은 `clientWidth 375`, `scrollWidth 2320`이며 swipe 입력으로 `scrollLeft 0→375`가 됐다. desktop rail control 10개는 모두 `display:none`이었다.
- 모바일 검색 입력은 viewport 안에 있었고 bottom navigation과 player는 경계선 1px만 공유하며 콘텐츠가 겹치지 않았다.
- EMS 트랙을 touch click하자 current track, 한국어 로그인 안내, `returnTo=%2Fems` 링크가 표시됐고 내부 오류 코드는 없었다.

## 검색·빈·오류 상태

- `Take Five` 입력은 section 대신 `“Take Five” 검색 결과 2곡`으로 전환됐다. 입력을 지우자 캐시된 5개 section이 즉시 복귀했다.
- `__music_pie_qa_no_result_20260927__` 입력은 `검색 결과가 없습니다. 다른 제목이나 아티스트를 입력해 보세요.`를 표시했다.
- 운영을 고의로 장애 상태로 만들지 않았다. Vitest에서 section `503`, section empty, catalog search `503`을 각각 재현해 section error, 준비 중, 검색 error 한국어 문구를 확인했다.
- catalog search `503` 회귀 테스트를 `apps/web/src/components/ems/ems-browser.test.tsx`에 추가했다.

## 자동 검증

- 관련 Vitest 4개 파일: 26개 테스트 통과.
- `EmsBrowser` focused Vitest: 6개 테스트 통과.
- ESLint: 오류 0, 기존 경고 5.
- Next.js production build와 TypeScript: 통과. 로컬 Auth0 환경 변수가 없는 경고만 발생했다.
- 범위를 넓힌 관련 7개 파일 실행은 29개 통과, 기존 Home hero mock 기대 1개 실패였다. 운영 Home hero는 브라우저에서 정상 표시됐고 이번 변경의 신규 회귀로 보지 않는다.

## 판정과 미검증 범위

- blocking UI 결함은 0건이다.
- 실제 iOS/Android 기기, Safari/Firefox, Bluetooth 출력, 백그라운드 오디오, 로그인 TIDAL 스트림의 HLS/AAC codec 재생은 확인하지 않았다.
- 이번 비회원 QA는 재생 선택과 로그인 recovery 경계까지 확인한 것이며 실제 codec 재생 성공으로 간주하지 않는다.

