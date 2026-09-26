# 관리자 공개 음악 URL 수집·검토

## 변경 이유와 범위

관리자가 허용된 공개 Melon·TIDAL URL을 제출해 EMS 후보 정보를 가져오고, 출처·수집 시각을 확인한 뒤 곡별 승인·제외를 결정할 경로가 없었다. 구현 범위는 문서화된 설계에 따라 관리자 화면, 보호 API, 작업자 추출, 기존 EMS 검증 연동까지다.

## 변경 내용

- `020_ems_manual_url_import.sql`에 제출 작업과 최대 100곡의 추출 항목을 위한 임시 검토 테이블과 상태·길이·건수 제약을 추가했다. 역변경 migration도 제공한다.
- 관리자 `/admin/ems/url-imports`에 URL 입력, 작업 상태, 출처·수집 시각, 곡 메타데이터, 곡별 승인·제외와 일괄 EMS 확인 요청을 추가했다.
- 관리자 API는 기존 Auth0 관리자 가드와 same-origin 검사를 적용한다.
- Melon은 기존 `MelonClient`·`parse_songs`로 한국대중음악 장르 목록 페이지를 처리한다. TIDAL은 공개 트랙·앨범·플레이리스트 URL만 받아 기존 catalog parser로 최대 100곡을 추출한다.
- 임의 도메인, 비HTTPS·사용자 정보·비표준 포트, TIDAL query/fragment, 허용되지 않은 경로는 거부한다. 외부 리다이렉트는 따르지 않는다.
- 승인 곡은 기존 EMS admin worker와 resolver를 사용한다. TIDAL 항목은 제출된 정확한 track ID를 재조회하며, 모든 소스는 KR `STREAM`·최소 재생시간 검증 후 promotion과 embedding을 거친다.
- 원본 URL·항목별 URL·수집 시각은 검토 테이블에 남고, 활성화된 트랙에는 `user_import` source metadata로 보존된다.

## 검증

- `python -m compileall -q services/ems-pipeline/src/ems_pipeline`: 통과.
- `apps/admin`: `npm run build` — TypeScript와 Vite production build 통과.
- `apps/web`: `npm run build` — Next.js production build와 TypeScript 통과. Auth0 개발 환경 변수가 없는 경고가 있었고, 관리자 asset 생성 이후 순차 재빌드에서 standalone asset tracer 오류는 재현되지 않았다.
- `git diff --check`: 통과.
- 자동 테스트는 요청에 따라 추가하거나 실행하지 않았다.

## 미검증·배포 상태

- migration 020을 운영 DB에 적용하지 않았고 Web·EMS 이미지를 배포하지 않았다.
- 공개 Melon/TIDAL live extraction, 로그인 관리자의 검토·승인 브라우저 조작, promotion·embedding 결과는 아직 확인하지 않았다.
- TIDAL API가 앨범·플레이리스트 관계 track을 포함하지 않거나 pagination 계약을 바꾸는 경우 해당 소스 추출은 실패로 기록된다.
- 기존 로그인 사용자의 좋아요·추천 액션을 취향 프로필 재계산에 반영하는 경로는 이번 변경에 포함하지 않았다.

## 다음 작업

1. migration과 Web·EMS release를 운영에 적용한 뒤, 공개 Melon 장르와 TIDAL track·album·playlist URL을 관리자 계정으로 검증한다.
2. 사용자별 좋아요 및 추천 수락·거절을 취향 프로필 입력과 재계산 흐름에 연결한다.
3. 일반 회원에게 관리자 경로가 노출되지 않는지와 작은 화면 검토 화면을 브라우저로 확인한다.
