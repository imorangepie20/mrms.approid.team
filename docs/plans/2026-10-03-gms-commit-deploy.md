# GMS 변경 커밋·푸시·재배포 계획

## 범위와 순서

사용자의 커밋·푸시·배포 요청에 따라 GMS 저장 상태/영속 MMS, 추천 이력 선택 삭제, HUD 템플릿 성공 알림·삭제 확인창과 관련 회귀·기록을 현재 main에 커밋하고 origin/main에 일반 push한다. HEAD와 origin/main이 동일한 4aabdd9임을 확인했다. 요청 밖 변경·비밀값·임시 artifact는 추가하지 않는다.

직전 기능 구현의 전체 575개·관련 59개 통과, lint 오류 0·기존 경고 6, 52개 route build 결과를 재사용한다. 기능 코드를 새로 바꾸지 않으며 커밋된 apps/web 변경 파일을 직전 검증된 운영 release와 줄바꿈 정규화 기준으로 비교한다. 비교가 다르면 해당 변경의 검증을 다시 수행한다.

커밋 후 git archive HEAD로 release를 생성하고 SHA-256과 org.opencontainers.image.revision label에 해당 Git SHA를 기록한다. 기존 운영 방식으로 Web image만 build/교체하고 schema·runtime env·다른 서비스는 유지한다. 직전 release/image를 rollback 대상으로 보존하며 실패 시 current/image를 복구한다. 완료 증거와 실제 적용한 Git SHA·digest·image/health·비-Web ID 비교는 서버 shared/artifacts/<release>/verification.txt와 로컬 검사 로그에 기록한다. 기능 변경 기록의 기존 snapshot 배포 사실은 해당 시점의 기록으로 보존한다.

## 객관적 완료 체크

1. 코드·품질: 커밋 범위/비밀값 제외 검사·git diff --check exit 0, 커밋된 Web 변경 파일이 직전 검증된 release와 정규화 SHA 비교 일치. 직전 전체 575개·관련 59개, lint·build 통과 증거 확인.
2. Git: 커밋 생성·push exit 0, HEAD=origin/main=원격 main SHA, 작업 트리 clean.
3. 운영: 해당 커밋 git archive digest/이미지 revision 일치·Web 재배포, healthy·restart 0·local/public readiness 200·비-Web ID 유지·rollback 증거/임시 archive 정리. HTTP와 소스/label 검사로 검증하고 사용자 추천·취향 데이터를 추가 변경하지 않는다.

필수 체크 3개 모두 PASS 후 완료로 보고한다. 조건부 DB 6개 skip은 이전 기능 검증 기록의 미실행 사유를 그대로 유지한다.
