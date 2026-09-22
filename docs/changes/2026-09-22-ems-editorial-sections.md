# EMS 에디토리얼 섹션 구현·운영 기록

## 이유와 범위

Home과 EMS의 fixture 중심 구성을 실제 TIDAL 공개 `EDITORIAL` 플레이리스트 provenance에 기반한 음악 섹션으로 교체했다. 동일한 section API와 rail 컴포넌트를 사용하며, Home은 우선순위 상위 3개, EMS는 최대 5개 섹션과 별도 검색 모드를 제공한다.

## 최종 동작

- 섹션 문구는 `신곡 퍼레이드`, `시원한 가을 바람과 함께, 재즈`, `도시의 밤을 채우는 R&B`, `기분 좋은 리듬이 필요할 때`, `잠깐, 음악에만 집중`으로 고정했다.
- pipeline은 TIDAL 에디토리얼 플레이리스트의 갱신 시각, 팔로워 수, 트랙 위치와 popularity를 이용해 후보 edition을 결정하고 source playlist ID·이름을 membership에 남긴다.
- Web은 최신 KR `STREAM` availability가 playable인 active EMS track만 표시한다. embedding 완료 여부는 EMS 탐색 조건이 아니다.
- 한 응답에서 같은 EMS track은 앞선 섹션에만 남기고, 뒤 섹션은 더 깊은 후보에서 최대 12곡을 보충한다. 빈 섹션을 제거한 뒤 Home/EMS의 section limit을 적용한다.
- EMS 검색은 250ms debounce와 request abort를 사용하며, 검색 실패·취소 후에도 이미 받은 에디토리얼 섹션을 보존한다.
- 기존 Spotify·Apple Music 모양의 비기능 필터와 Home fixture rail은 제거했다.

## 코드·로컬 검증

- 기준 커밋: `439c934d5ecccd4a55e1b4fa8661a1d3fd20b16f`.
- pipeline: `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests` 결과 `44 passed`.
- Web: `npm --prefix apps/web test` 결과 `79 files, 319 tests passed`.
- `npm --prefix apps/web run lint` 결과 오류 0, 기존 test helper의 unused parameter 경고 3건.
- `npm --prefix apps/web run build`와 `git diff --check` 통과. build의 Auth0 환경 변수 경고는 로컬 검증 환경에 secret을 주입하지 않아 발생했다.
- Impeccable UI 검출 결과 지적 0건.
- 전체 diff review의 Important 3건인 전역 중복 후 후보 보충, 빈 섹션 제거 후 section limit, 신곡 플레이리스트 갱신 시각·트랙 위치 반영을 회귀 테스트와 함께 수정했다.

## Zorin 운영 결과

- 검토 소스를 `/home/approid/apps/music-pie/releases/439c934d5ecc`에 격리했다.
- 빌드 이미지:
  - `music-pie-web:439c934d5ecc`: `sha256:a886f53be91ad39cbfecd50c307171ae099e633159417799de427b0b946d0fe0`
  - `music-pie-ems-pipeline:439c934d5ecc`: `sha256:ad1c06713149316c081035293060bf510684423f7e835a54ad3908b77e0c2064`
- 롤백 태그:
  - `music-pie-web:rollback-running-before-editorial-20260922`: `sha256:49715e88494fe4c77c54d209f3ae9c005199e4b37d665dfb4dfa99894f8b3822`
  - `music-pie-web:rollback-current-before-editorial-20260922`: `sha256:eab3a0624cbaf634ca625c9f08835f868bb6b6826cce596dbba8b0d0841c4654`
  - `music-pie-ems-pipeline:rollback-before-sections-20260922`: `sha256:8e5b86cfd6225d8028ce1ca9559203546372e2390a1b451b49b872304e00fef9`
- migration 전 `/home/approid/apps/music-pie/shared/backups/ems-editorial-before-439c934d5ecc.dump`를 생성했다. SHA-256은 `7b6c1fbbe05f94e5d39acdd8955b2427431d0e3e9bf1af16231dc7b5d9e9cc79`다.
- tracked runner를 `--baseline-through=008_ems_catalog.sql`로 실행해 `1 pending migrations applied`를 확인했고, `ems_editorial_sections`, `ems_track_sections` 존재를 조회했다.
- dry-run은 실제 쓰기 없이 아래 결과를 냈다. 현재 dry-run의 `stored`는 항상 0이므로 `joined`를 projected stored로 사용했다.

| slug | discovered | joined/projected stored | gate |
|---|---:|---:|---|
| `new-releases` | 599 | 0 | 실패 |
| `seasonal-jazz` | 691 | 0 | 실패 |
| `night-rnb` | 1,139 | 3 | 실패 |
| `feel-good` | 727 | 10 | 통과 |
| `focus` | 773 | 0 | 실패 |

- 배포 gate인 “최소 4개 섹션에 각 6곡 이상”을 충족한 섹션은 1개뿐이다. 실제 sync, image `current` 전환, release symlink 전환, Web 재시작을 수행하지 않았다.
- dry-run 뒤 두 신규 테이블의 row count가 각각 0임을 확인했다. 기존 release symlink는 `/home/approid/apps/music-pie/releases/3f5ea5e2c270`이며 `/api/health/ready`는 `{"status":"ready"}`, Web container는 `healthy`다.

## 미검증·보류

- 데이터 gate 실패로 공개 Home/EMS UI, 키보드 focus, horizontal scroll, play action, 검색 전환의 production browser QA는 수행하지 않았다.
- 1,000곡 resolver run은 기존 승인 범위를 확장하지 않고 `paused`로 유지했다.
- dry-run의 `stored`가 projected count를 표시하지 않는 Minor review finding은 이번 배포 gate에서 `joined`로 대체했고 별도 개선으로 남겼다.
- 009 migration은 비파괴적으로 적용됐지만 신규 테이블은 비어 있으며, 기존 Web은 이 테이블과 신규 endpoint를 사용하지 않는다.

## 다음 작업

1. paused 1,000곡 후보 중 에디토리얼 섹션과 조인 가능한 track을 우선해 bounded resolver batch를 별도 승인 후 확장한다.
2. dry-run에서 최소 4개 섹션이 각 6곡 이상인지 다시 확인한다.
3. gate 통과 후 실제 sync, 중복 검증, `current` 태그·release symlink 전환, 로컬·공개 smoke와 desktop/mobile browser QA를 수행한다.
