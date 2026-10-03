# GMS 수락 운영 적용 계획

## 원인과 구현

사용자는 `mrms.approid.team`의 +MMS 무반응과 MMS 미변화를 보고했다. SSH에서 운영 current가 `/home/approid/apps/music-pie/releases/4636ee2`임을 확인했다. 앞선 로컬 수정은 미배포였으므로 실제 화면까지 요청이 해결되지 않았다.

- 앞선 결정 성공/실패·수락 영속 조회·모바일 이력 수정을 운영 Web에 적용한다.
- 저장 중 상태와 성공한 곡명·MMS 보기 링크를 안내한다. partial 성공 안내를 보존한다.
- 결정 저장 직후 `/gms`, `/gms/history`, `/mms`를 revalidate한다. 저장 실패는 invalidation하지 않고 프로필 갱신 실패에도 저장된 결정을 조회할 수 있게 한다.
- 테스트 후 로컬 검증된 소스 snapshot을 고유 release로 전달해 Web image만 교체한다. 원래 release/image와 비-Web container ID를 기록하고 health 실패 시 이전 Web으로 되돌린다. schema·외부 서비스 설정·EMS 작업은 변경하지 않는다.

## 객관적 체크

1. 클릭 상태: 대기·저장 성공 안내·MMS 링크·실패 재시도·중복 차단 회귀 통과.
2. 영속 경계: 결정 API의 저장 성공/partial 성공에 세 route invalidation, 저장 실패/미인증에는 없음; 기존 MMS 조회 테스트 통과.
3. 품질: Web 전체 test·lint·production build·diff check exit 0.
4. 운영 적용: 고유 release·archive digest·Web image 교체·public/local readiness 200·비-Web ID 불변.
5. 실제 화면: 운영 GMS +MMS 뒤 성공 안내·행 제거, MMS 해당 곡 표시와 reload 유지, screenshot과 오류 로그 확인.
6. 경계·기록: 범위 diff 검토·비밀값 제외 snapshot·rollback 대상 기록·임시 archive 정리·문서 갱신.

6개 모두 PASS일 때만 운영 기능 수정 완료를 보고한다. 실행하지 못한 검증은 UNVERIFIED로 별도 기록한다.

## 실행 결과

6개 모두 PASS. [운영 적용 기록](../changes/2026-10-03-gms-production-accept.md)에 release·검증·실계정 액션·조건부 skip·rollback 근거를 기록했다.
