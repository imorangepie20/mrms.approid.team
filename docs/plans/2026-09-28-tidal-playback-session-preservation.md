# TIDAL 재생 세션 보존 계획

## 문제

일반 Authorization Code 연결과 전체 재생용 Device Code 연결이 사용자별 `tidal_connections` 한 행을 공유한다. 전체 재생 연결 뒤 일반 OAuth를 다시 완료하면 일반 scope가 Device scope와 token을 덮어써서 플레이어가 `TIDAL 재생 연결`을 다시 표시한다.

## 변경 범위

1. 일반 OAuth callback 저장을 전용 함수로 분리한다.
2. 같은 Auth0 사용자와 같은 TIDAL 사용자에 이미 사용 가능한 Device 세션이 있으면 일반 OAuth token으로 덮어쓰지 않는다.
3. TIDAL 사용자 ID가 다르거나 기존 Device 세션을 갱신할 수 없으면 새 OAuth 연결로 교체한다.
4. 저장 판정은 DB transaction과 `FOR UPDATE` 안에서 수행해 refresh 및 동시 연결과 충돌하지 않게 한다.
5. token, cookie, signed stream URL과 raw query는 코드·로그·문서에 기록하지 않는다.

## 완료 기준

- 같은 TIDAL 계정의 일반 재연결 뒤 Device scope와 암호화 자격 증명이 보존된다.
- 다른 TIDAL 계정은 이전 사용자의 Device 세션을 승계하지 않는다.
- 만료됐고 refresh할 수 없는 Device 세션은 보존하지 않는다.
- callback, 연결 저장소 focused test와 Web 전체 test·lint·build가 통과한다.
- 커밋과 push 뒤 Web만 배포하고 readiness, Home, MMS, EMS smoke를 확인한다.
- 배포 전 release/image를 롤백 식별자로 기록하고 EMS pipeline/source routine 및 사용자 데이터를 변경하지 않는다.

## 검증 순서

1. 보존·교체 경계 회귀 테스트 작성 및 실패 확인
2. transaction 기반 저장 구현
3. focused test, 전체 test, lint, build, `git diff --check`
4. commit, push, 새 release/image 생성과 Web 재생성
5. container health와 local/public HTTP smoke, 운영 연결 메타데이터만 확인

