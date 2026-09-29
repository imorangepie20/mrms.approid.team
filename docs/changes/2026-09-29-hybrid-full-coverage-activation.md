# hybrid full coverage 제한 활성화

## 변경 이유

partial audio coverage에서는 분석 완료 여부가 순위 가용성 편향으로 작용했다. eligible 후보 전체를 분석한 동일 snapshot의 full hybrid를 평가하고, 이후 catalog 변동이 생겨도 partial hybrid를 제공하지 않는 gate와 bounded shadow 보관 정책이 필요했다.

## 변경 내용

- candidate audio cohort A·B·C를 bounded provider 요청으로 처리해 최종 자연 shadow의 60곡 모두 exact-version audio·mood·rhythm component를 확보했다.
- serving gate는 completed audio profile뿐 아니라 audio·mood·rhythm coverage가 모두 정확히 1인 경우만 `hybrid-v0`를 허용한다. 한 component라도 미달하면 `component_coverage_incomplete`로 baseline fallback하고 shadow provenance에 저장한다.
- migration 028은 새 fallback reason을 허용하고, 최대 30일·사용자별 최신 100회의 shadow 보관 정책을 위한 preview·prune 함수를 추가한다.
- shadow 저장 transaction은 candidate 저장 뒤 현재 사용자 범위의 오래된 run을 정리한다. candidate는 FK cascade로 함께 삭제하며 recommendation decision·profile·EMS 데이터에는 접근하지 않는다.
- 현재 사용자 한 명만 allowlist하고 minimum coverage 1로 제한 활성화한다. 인증 subject는 운영 비밀 설정에만 두며 저장소에는 남기지 않는다.

## 검증 결과

- 최종 full-coverage shadow: `6b0f8471-0cae-4a4f-a748-e984c080a3a6`, candidate 60, terminal 제외 2, backfill 2, 세 component coverage 1, fallback 후보 0, null component 0.
- full hybrid/text baseline: overlap@K 0.5, 평균 절대 rank displacement 10.966666666666667, 같은 artist 비율 0, Selector 변경 12. hybrid base top 12와 Selector top 12 구성은 같다.
- 임시 PostgreSQL에 migration 28개 전체 적용 성공. 보관 fixture 102건에서 preview 2건, 삭제 2건, 100건 보존을 확인했고 028 down/up도 통과했다.
- Web 핵심 회귀 3개 파일·22개 테스트와 전체 134개 파일·515개 테스트가 통과했다. 조건부 PostgreSQL suite 3개 파일·3개 테스트는 환경 변수 미설정으로 skip됐다.
- ESLint 오류 0, 기존 경고 5개이며 production build·TypeScript·49개 route 생성을 통과했다.

## 운영 배포

- 배포 전 상태다. 기능 commit, local `main` fast-forward, `origin/main` push, 운영 backup·migration·Web 교체·제한 활성화와 로그인 검증 뒤 이 절을 갱신한다.

## 미검증·다음 작업

- 실제 accept·reject label이 없어 ranking 가중치는 변경하지 않았다.
- 다른 사용자 확대는 이번 범위가 아니며 canary 관찰 뒤 별도 결정한다.
