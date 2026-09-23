# EMS 원천 정기 갱신

## 이유

관리자가 시작한 단일 TIDAL 수집이 끝난 뒤에도 새 곡이 유입되어야 한다. MusicBrainz core와 canonical은 별개 원본이지만, EMS 후보는 두 자료를 결합해 만든다. 관리자에게 원천별 실제 갱신 상태와 조작 메뉴가 필요하다.

## 변경

- `012_ems_source_routines.sql`: TIDAL 에디토리얼·MusicBrainz core·canonical의 활성화, 버전, 다음 확인, 오류, 연결 작업을 저장한다. 플레이리스트의 원본 갱신 시각도 저장한다.
- TIDAL 작업 완료 뒤 하루 후 다음 작업을 예약한다. 변경되지 않은 에디토리얼 플레이리스트는 다시 읽지 않는다. 수동 일시정지 작업은 자동 재개하지 않는다.
- 별도 `ems-source-routines` 컨테이너가 core `LATEST`를 12시간마다, canonical 배포 목록을 24시간마다 확인한다. 새 버전만 다운로드·검증하고 저장소 밖 공유 디렉터리에서 필요한 데이터를 추출한다.
- core의 새 녹음·새 ISRC를 canonical 정보와 결합해 manifest 후보를 만든다. 현재 활성 EMS의 MBID·ISRC는 제외한다. 후보는 기존 TIDAL resolver의 정확 매칭·KR STREAM 확인과 임베딩을 거친다. MusicBrainz 원천 버전을 `ems_track_sources`에 기록한다.
- 관리자 사이드바 `정기 수집` 메뉴에서 원천별 주기·버전·최근 확인·다음 확인·오류와 활성화·즉시 확인을 제공한다. 사용자 플레이리스트 가져오기는 이벤트 기반 경로로 표기한다.

## 검증

- `python -m compileall -q services/ems-pipeline/src/ems_pipeline`: 통과.
- `npm run build` (`apps/admin`, `apps/web`): 통과. Web 로컬 빌드는 Auth0 환경 변수가 없어 설정 경고가 나왔지만 타입 검사와 빌드를 완료했다.
- 변경한 Admin/Web 파일 ESLint: 오류 0. Admin 기존 `Sidebar.tsx` 경고 2건은 남았다.
- 로컬 EMS Docker 이미지 빌드와 이미지 안 `source_routines` import·`gpg` 설치 확인: 통과.
- `git diff --check`: 통과.
- 로컬 Compose config는 Zorin 전용 `env_file` 절대 경로가 없어 실행되지 않았다. 운영 서버에서 확인한다.
- 자동 테스트는 요청되지 않아 추가·실행하지 않는다.

## 미검증·다음 작업

- 최초 새 MusicBrainz core snapshot의 대용량 다운로드·증분 추출·TIDAL 후보 처리까지 실제 운영 결과를 확인한다.
- 운영 관리자 계정으로 루틴 조회·조작을 확인한다. 비로그인 화면에는 로그인 안내가 표시된다.

## 운영 적용

- 릴리스 `6a320d5`를 Zorin에 배포했다. 이전 `b860bff` 이미지와 릴리스는 롤백용으로 유지했다.
- migration 전 백업을 저장소 밖에 만들고 `pg_restore -l`로 읽기 확인했다. `012_ems_source_routines.sql` 1건을 적용했다.
- 새 Web·EMS 워커를 재생성한 뒤 readiness 200, `/admin/ems/routines` 200, 비로그인 루틴 API 401을 확인했다.
- 기존 수집 작업은 재시작 뒤 `running / resolving`으로 이어졌고 활성곡 3,435곡을 확인했다.
- `ems-source-routines` 컨테이너를 시작했다. canonical `20260917-080002`를 검증·추출하고 다음 확인 시각을 예약했다. core `20260923-002121`은 다운로드 중이다.
- 고정 URL `/admin/assets/index.js`의 4시간 캐시 때문에 브라우저에 이전 메뉴가 남았다. 릴리스 `25a81f8`에서 자산 파일명에 해시를 넣고 Web을 재배포했다. 새 페이지 자산 URL, readiness 200, 브라우저의 `정기 수집` 화면과 사이드바 항목을 확인했다.
- 기존 TIDAL 수집은 Web 교체 후에도 `running / resolving`으로 진행했고 활성곡이 4,000곡을 넘어 4,172곡에 도달했다. 작업은 계속 진행 중이다.
- 새 core 아카이브 7,555,519,494바이트를 다운로드하고 서명·체크섬 검증 뒤 필요한 테이블을 추출하기 시작했다. 증분 후보의 최종 건수와 TIDAL 매칭은 아직 확인하지 못했다.
