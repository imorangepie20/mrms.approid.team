# TIDAL 콘텐츠 AI 분석 입력 제약 해소

- 날짜·작업명: 2026-09-21 TIDAL AI 분석 입력 제약 해소
- 변경 이유: `docs/changes/2026-09-20-auth0-tidal-authentication-implementation.md`의 보류 조건이 TIDAL Developer Terms의 AI 서비스 제한을 확인하기 전까지 TIDAL 콘텐츠를 AI 분석 입력으로 전달하지 못하게 막고 있었다. 사용자가 해당 약관 제약을 직접 해소했고, 테스트 배포까지는 이 제약 없이 개인화 추천 기능을 개발하라고 지시했다.
- 최종 동작·관련 경로:
  - 보류 조건이 있던 문서를 현재 상태로 수정했다.
    - `docs/changes/2026-09-20-auth0-tidal-authentication-implementation.md`: 보류 항목에 제약 해소 사실과 이 문서 경로를 적었다.
    - `docs/overview/current-development-context.md`: `미검증·제약`에서 AI 분석 입력 보류를 지우고, `현재 구현`에 제약 해소 범위를 추가했다.
    - `docs/decisions/2026-09-20-personalized-recommendation-baseline.md`: 보류한 선택지와 미정 항목 가운데 AI 입력과 직접 관련된 제약 표현을 현재 상태로 정리했다.
  - 허용 범위: 테스트 배포까지. 사용자가 가져온 TIDAL 플레이리스트의 트랙 메타데이터를 임베딩 모델 입력으로 사용할 수 있다.
  - 제약 해소 대상이 아닌 항목: TIDAL 연결 해제 시 데이터 삭제 의무는 여전히 미확정이다. 이 항목은 AI 분석 입력 허용과 별개로 남겨둔다.
- 실제 검증 결과: 문서 변경만 수행했다. `AGENTS.md`가 참조하는 문서 경로 존재와 제약 문구의 일관성을 읽기로 확인했다. 제품 코드 변경은 없어 `npm test`·`npm run lint`·`npm run build`는 이 변경에 실행하지 않았다.
- 미검증 항목·이유:
  - 제약을 해소한 구체적 근거와 약관 조항은 사용자가 보유하고 있으며, 이 문서에 옮기지 않았다. 필요하면 사용자가 제공할 때까지 기다린다.
  - production 배포 시점의 허용 범위는 이 변경이 다루지 않는다. 테스트 배포 이후에는 별도 확인이 필요하다.
  - TIDAL 연결 해제 시 데이터 삭제 의무의 확정 여부. 사용자가 따로 알려주기 전까지 기존대로 보류한다.
- 다음 작업·시작 위치: 취향 분석·추천 서브시스템을 처음부터 설계한다. `docs/decisions/2026-09-20-personalized-recommendation-baseline.md`의 초기 전략과 이 제약 해소 범위를 출발점으로 삼는다.
