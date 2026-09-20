# TIDAL 콜백 공개 주소 리디렉션 수정

## 계획 및 완료 기준

- 프록시를 거친 TIDAL 콜백이 내부 `localhost` 주소로 이동하는 원인을 추적한다.
- 성공 콜백은 요청의 내부 주소와 관계없이 `APP_BASE_URL`의 `/onboarding?tidal=connected`로 이동해야 한다.
- 회귀 테스트, 전체 테스트, 린트와 프로덕션 빌드를 통과한 뒤 실제 공개 경로에서 연결 상태를 확인한다.

## 변경 이유와 내용

TIDAL 토큰 교환과 저장은 성공했지만 성공 응답의 기준 URL로 `request.url`을 사용해, 역방향 프록시가 전달한 `localhost:44119`가 브라우저 리디렉션에 노출됐다. 콜백 성공 리디렉션의 기준 URL을 공개 서비스 주소인 `APP_BASE_URL`로 변경하고, 내부 요청 URL을 입력으로 사용해도 공개 주소가 반환되는 회귀 테스트를 추가했다.

## 검증 결과

- `npm test -- src/app/api/tidal/callback/route.test.ts`: 수정 전 실패를 재현했고 수정 후 2개 테스트가 통과했다.
- `npm test`: 19개 파일, 42개 테스트가 통과했다.
- `npm run lint`: 오류와 경고 없이 통과했다.
- `npm run build`: `/api/tidal/callback`을 포함한 Next.js 프로덕션 빌드가 통과했다.
- `http://127.0.0.1:44119/onboarding?tidal=connected`: HTTP 200을 확인했다.
- `https://mrms.approid.team/onboarding?tidal=connected`: HTTP 200과 브라우저 렌더링을 확인했다.
- PostgreSQL 최신 연결 행에서 `connected`, access/refresh token 암호문 존재, `playlists.read` 범위를 확인했다. 토큰 원문은 출력하지 않았다.

## 미검증 항목 및 다음 작업

- 브라우저에서 `/api/tidal/status` JSON을 직접 여는 검증은 클라이언트 확장 프로그램의 `ERR_BLOCKED_BY_CLIENT`로 완료하지 못했다. 동일한 연결 상태는 PostgreSQL에서 확인했다.
- 플레이리스트 조회와 실제 MMS 초기화는 별도 후속 작업이다.
