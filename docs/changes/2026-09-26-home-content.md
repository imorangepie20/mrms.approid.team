# 메인 콘텐츠 확장

## 이유

기존 메인은 고정 헤더와 EMS 선곡만 보여줬다. 서비스 개념과 이용법, 음악 관련 읽을거리를 메인에서 안내하고 관리자가 문구와 노출을 바꿀 수 있게 했다.

## 변경

- 메인에 서비스 소개, EMS·GMS·MMS 개념, 3단계 이용법, 음악 이야기 카드 2개를 추가했다. 기존 실제 EMS 선곡은 유지했다.
- `017_home_content.sql`로 메인 전용 콘텐츠와 초기 문구 7건을 저장했다.
- 관리자 `화면 관리 → 메인 화면`에 콘텐츠 제목·본문·내부 링크·순서·노출 편집과 음악 이야기 추가·삭제를 연결했다. 기존 EMS 선곡 관리도 같은 화면에 남겼다.
- 공개 콘텐츠 API는 활성 행만 읽는다. 관리자 API는 Auth0 관리자 권한, 입력 길이·내부 링크 형식, 쓰기 요청의 출처를 검사한다.
- 소개/개념/이용법/음악 이야기 요청과 EMS 선곡 요청은 독립적으로 처리해 한쪽 오류가 다른 영역을 지우지 않게 했다.

## 검증

- Admin 및 Web production build 통과. Web 로컬·이미지 build의 Auth0 환경 변수 경고는 기존과 같다.
- 변경한 Admin/Web 파일 ESLint 오류 0건, Impeccable `detect` 결과 0건, `git diff --check` 통과.
- 자동 테스트는 사용자 요청이 없어 추가·실행하지 않았다.
- 운영 DB 백업 `/home/approid/apps/music-pie/shared/backups/pre-home-content-d7fdfe6.dump` (147,962,801 bytes)을 만들고 PostgreSQL 컨테이너 `pg_restore -l`로 목록을 확인했다.
- Zorin에 migration 1건 적용. Web 릴리스 `d7fdfe6`, 이미지 `music-pie-web:current` 배포 후 healthy, 공개 readiness 200을 확인했다. 이전 이미지는 `music-pie-web:pre-home-content-20260926`로 보존했다.
- 공개 콘텐츠 API 7건, 비로그인 관리자 API 401, 실제 브라우저 메인에서 네 영역과 EMS 실트랙을 확인했다. 로그인한 관리자 화면에서 메인 소개 저장 완료 표시를 확인했다.

## 미검증·다음 작업

- 브라우저 도구의 390×844 크기 전환이 실제 viewport에 반영되지 않아 모바일 시각 검증은 완료하지 못했다. CSS는 한 열 배치를 정의했다.
- 음악 이야기 추가·삭제와 일반 회원 계정의 관리자 차단은 실제 브라우저에서 수행하지 않았다.
