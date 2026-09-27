# Home·EMS 배포 브라우저 QA

## 목표

- 배포된 Home과 EMS를 데스크톱 및 `390x844` viewport에서 한 번의 bounded QA run으로 확인한다.
- 운영 데이터와 인증 상태를 변경하지 않고 section, rail, 검색, 비회원 재생 recovery, 빈·오류 문구를 검증한다.
- blocking UI 결함이 있으면 수정·회귀 검증하고, 없으면 관찰 결과와 미검증 범위를 기록한다.

## 범위와 중단 조건

- 대상은 `https://mrms.approid.team/`와 `/ems`, 공개 read API, 관련 Web 컴포넌트 테스트다.
- Home은 상위 3개 section, EMS는 전체 5개 section과 각 12곡을 기대한다.
- 브라우저 작업은 section·검색 조회와 트랙 선택까지만 허용한다. 로그인, 좋아요, 사용자 데이터 저장, 운영 DB write는 하지 않는다.
- API 실패, section/count 불일치, 문서 전체 가로 overflow, 레일 입력 불가, 재생 선택 무반응, 검색 전환 실패, 텍스트·고정 UI의 blocking overlap, 내부 오류 코드 노출이 있으면 release gate를 중단한다.
- 운영 서비스에 오류를 만들지 않는다. empty 검색은 고유한 무결과 문자열로 재현하고, section/search 오류 문구는 deterministic Vitest로 재현한다.

## 검증 순서

1. 운영 sections API의 `totalCount`, slug 순서, section별 곡 수, 전역 중복 수를 기록한다.
2. 데스크톱 Home과 EMS의 section 수, rail overflow, 문서 overflow, 제거된 platform filter를 확인한다.
3. 레일 focus와 `ArrowLeft`/`ArrowRight`/`Home`/`End`, 이전·다음 control 상태를 확인한다.
4. 비회원 트랙 선택 후 current track, 한국어 로그인 안내, `returnTo`, 내부 오류 비노출을 확인한다.
5. EMS에서 정상 검색, 빈 검색, 입력 해제 뒤 section 복귀를 확인한다.
6. `390x844`에서 Home·EMS를 다시 확인하고 rail swipe, 고정 navigation/player, 검색 입력, 텍스트 배치를 확인한다.
7. 관련 Vitest, ESLint, production build, 브라우저 console을 확인하고 결과를 변경 기록에 남긴다.

## 완료 기준

- Home 3개, EMS 5개 section과 API/UI `totalCount`가 일치한다.
- desktop/mobile 핵심 경로에 재현 가능한 수치 또는 화면 증거가 있다.
- blocking UI 결함이 0건이다.
- 실제 기기, 브라우저, 로그인 TIDAL codec과 백그라운드 재생 등 미검증 범위를 명시한다.

