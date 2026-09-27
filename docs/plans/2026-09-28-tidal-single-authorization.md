# TIDAL 단일 승인 연결 계획

## 목표

- 사용자가 TIDAL 연결 후 첫 스트리밍에서 다시 승인하지 않도록 최초 연결을 재생 가능한 Device 승인 흐름으로 통합한다.
- 플레이리스트 조회와 스트리밍이 같은 저장 연결을 사용하며, 재생 자격이 이미 있으면 승인 UI를 다시 노출하지 않는다.

## 변경

1. `/tidal-connection`의 완료 기준을 단순 `connected`가 아니라 재생 가능한 Device scope 보유로 강화한다.
2. 기존 Device 승인 컴포넌트를 최초 연결 문구와 완료 후 이동을 지원하도록 확장한다.
3. 온보딩의 일반 OAuth 링크를 `/tidal-connection` 통합 관문으로 교체한다.
4. 기존 플레이어의 재생 자격 복구 동작은 유지한다. 이전 일반 OAuth 연결 사용자는 통합 관문에서 한 번만 승격한다.

## 검증

- 연결 관문은 Device scope가 없는 연결을 완료로 오인하지 않는다.
- 최초 연결 버튼은 Device 승인 API만 호출하고, 완료 뒤 요청한 내부 경로로 이동한다.
- Device scope가 있는 연결은 추가 승인 없이 계속할 수 있다.
- 관련 Vitest, 전체 Web 테스트, lint, production build를 통과한다.
- 배포 후 Web health와 공개 연결 화면을 확인하며 EMS worker, 사용자 데이터, DB schema는 변경하지 않는다.

## 롤백

- 배포 전 Web image와 release symlink를 식별해 보존한다.
- 결함 시 이전 Web image와 release symlink로 되돌린다.
- 인증 token, cookie, Device code와 provider 원문 응답은 로그·문서·저장소에 기록하지 않는다.
