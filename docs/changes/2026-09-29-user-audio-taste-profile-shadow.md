# 사용자 오디오 취향 프로필 shadow 기반

## 변경 이유

EMS 트랙의 preview 분석 결과는 운영에 저장되고 있었지만 사용자별 오디오 취향을 계산·버전 관리하는 계층은 없었다. text 768차원 프로필과 섞지 않고, 실제 GMS 순위에 영향을 주기 전에 사용자 범위·거절 제외·모델 버전·coverage를 검증할 수 있는 shadow 저장 기반이 필요했다.

## 변경 내용

- `024_user_audio_taste_profiles.sql`에 사용자별 오디오 프로필과 2,304차원 centroid 전용 테이블을 추가했다. text 프로필 테이블은 변경하지 않는다.
- 프로필은 독립 UUID `profile_version`, feature·MAEST·MusicNN·algorithm version, eligible/analyzed count, 생성 coverage, SHA-256 input fingerprint, DSP 요약과 18개 high-level prediction 평균을 저장한다.
- 입력은 선택한 TIDAL 플레이리스트와 TIDAL track 좋아요·GMS accept 중 active EMS에 연결된 곡이다. 같은 사용자의 reject 이력이 하나라도 있으면 입력 경로와 관계없이 제외한다.
- analyzed 입력은 completed `essentia-dsp-v1`, MAEST `essentia/discogs-maest-30s-pw-519l@2` 2,304차원 L2 vector, MusicNN revision 1·vocabulary 2의 필요한 18개 label을 모두 가진 경우로 제한한다.
- playlist·artist·positive feedback 가중치는 기존 text 프로필과 같은 계산 함수를 재사용한다. global centroid는 한 곡부터 만들고, 다중 군집은 60곡 이상·군집당 10곡 이상·silhouette 0.10 이상일 때만 만든다.
- profile과 centroid 교체는 한 transaction의 `building → completed` 전환으로 저장한다. 실패 시 이전 completed row와 centroid가 rollback으로 유지된다.
- 명시적 repository refresh만 제공했다. GMS 조회·점수·응답과 사용자 요청 경로, scheduler에는 연결하지 않았다.

## 검증 결과

- 계약 테스트는 구현 전 새 모듈·migration 부재로 실패하는 것을 확인한 뒤 구현했다.
- 관련 Vitest: 4개 파일, 19개 테스트 통과. PostgreSQL 통합 파일은 환경 변수 없이 skip됐다.
- 전체 Web Vitest: 123개 파일 통과, 환경 의존 2개 파일 skip, 474개 테스트 통과·2개 skip.
- `npx tsc --noEmit`, ESLint 오류 0, Next.js production build를 통과했다. ESLint의 기존 경고 5개는 이번 변경 파일 밖에 있다.
- 임시 `pgvector/pgvector:0.8.6-pg16-bookworm` DB에 migration 24개를 적용하고 PostgreSQL 통합 테스트 1개를 통과했다. 실제 2,304차원 centroid 저장과 reject 제외를 확인했다.
- 같은 임시 DB에서 024 down SQL이 오디오 프로필 테이블만 제거하고 text 프로필·EMS 테이블을 보존하는지 확인한 뒤 024를 재적용했다.
- 운영 적용 전 custom-format backup을 생성하고 `pg_restore --list`를 통과했다. backup은 `/home/approid/apps/music-pie/backups/pre-024-audio-taste-20260929-091424.dump`, SHA-256은 `3247841b2a80605cd909cc13f68a0f99ccbe666245cb850576f2d659fc0827bc`다.
- 운영 migration은 23개에서 24개로 증가했고 두 오디오 프로필 테이블이 생성됐다. 기존 text 프로필과 EMS 데이터는 유지됐다.
- 운영 읽기 전용 점검은 사용자 1명, eligible 6곡, exact-version analyzed 교집합 0곡이었다. 오디오 프로필 행은 0개이며 임의 profile 생성이나 사용자 데이터 변경을 하지 않았다.
- 배포 뒤 Web은 healthy, local live·ready와 공개 Home·EMS·GMS·Search·ready는 HTTP 200, 비로그인 관리자 화면은 307·API는 401, 최근 Web 오류 로그는 0건이었다.
- Web만 재생성했다. PostgreSQL·embedding·audio-analysis·EMS·source-routines·tunnel container ID는 유지됐다.

## 배포와 rollback

- 기능 커밋: `3f4fba3`
- archive SHA-256: `2d6bb5a96bfeda952e2d1659823accc9a08107cbfda76763016cee8cbe45ec0a`
- Zorin release: `/home/approid/apps/music-pie/releases/3f4fba3`
- 새 Web image: `sha256:a11db3345b9b1a4e715f5dc50d1d059f770c10f9d1fab40ca0fa8813e9b70233`
- rollback image: `music-pie-web:pre-3f4fba3` → `sha256:8b9627b8dcbbbe9a56b06be36fe7e9cd6de522e1211f77e708e09cb3cbdd62d6`
- 문제가 생기면 Web image와 `current` symlink를 이전 release로 되돌린다. 024는 additive이므로 운영 rollback에서 down SQL로 사용자 데이터를 삭제하지 않고, 필요하면 새 코드의 사용을 중단한 뒤 검증한 backup을 사용한다.

## 미검증·다음 작업

- 운영 eligible 트랙과 exact-version analyzed 트랙의 교집합이 0이라 실제 사용자 오디오 프로필 생성 결과는 없다.
- sample cohort를 확대할 때도 자동 전체 enqueue를 활성화하지 않고 bounded 실행과 자원 gate를 유지한다.
- 다음 단계는 coverage가 생긴 뒤 baseline과 audio hybrid의 순위·점수 분포만 기록하는 shadow ranking pipeline이다. activation 임곗값과 실제 GMS 반영은 별도 승인·검증 전까지 확정하지 않는다.
