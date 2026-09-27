# Editorial section 실제 sync와 release 전환

## 이유와 범위

- Resolver 확장 뒤 Step 3 dry-run이 5개 section 모두 gate를 통과해 실제 membership sync와 release 전환을 진행했다.
- 기존 sync가 joined 전체를 저장하고 실제 write 직전 gate를 다시 확인하지 않는 문제를 먼저 수정했다.
- 상시 `ems-pipeline`과 `ems-source-routines` container는 시작·재생성·재시작하지 않았다.

## 구현

- section sort order 전역으로 track을 중복 제거하고 각 section을 rank 기준 최대 12곡으로 제한한다.
- 같은 고정 projection으로 최소 4개 section이 각각 6곡 이상인지 판정한다. 미달이면 write 전에 `EditorialSectionSyncGateError`로 중단한다.
- 실제 5개 section UPSERT, 기존 membership DELETE, 새 membership INSERT를 단일 transaction으로 처리한다.
- dry-run과 actual sync가 같은 projection 규칙을 사용한다.

## 검증한 release

- 기능·release 커밋: `7e79ad2bd9af`.
- Web image: `music-pie-web:7e79ad2bd9af`, `sha256:00c8c20253aa18c3ff5d6c2952eb79b2a0480024835633858aabfdf9e522c2ce`.
- EMS image: `music-pie-ems-pipeline:7e79ad2bd9af`, `sha256:a2117904efed9b4c1c9befa1ccfbb2e76b138a776f55a1b18262d721c0796143`.
- release symlink는 `/home/approid/apps/music-pie/releases/7e79ad2bd9af`로 전환했다.

## DB 백업과 rollback

- sync 전 backup: `/home/approid/apps/music-pie/shared/backups/pre-editorial-sync-7e79ad2.dump`.
- 크기 `175,068,168` bytes, SHA-256 `b3c8d54892f3fc637e689085a4f36635494afea03be817cbfacd1a1612058e2f`; `pg_restore -l`로 읽기를 확인했다.
- 이전 release: `/home/approid/apps/music-pie/releases/bc47ed34e971`.
- Web rollback: `music-pie-web:rollback-f73b37b6321e`, image `sha256:f73b37b6321e650dbd22d49276e7c7d2913ab0dac2911812a42eab6d61a02acf`.
- EMS rollback: `music-pie-ems-pipeline:rollback-a8a84e4716c3`, image `sha256:a8a84e4716c3d2afa8cc1180a2cc8ea7b227371ac5598f8777093743a9d0ecee`.
- Web smoke 실패 시 이전 symlink와 Web/EMS tag를 복원하고 Web만 재생성한다. section 데이터 복구는 위 backup과 이전 membership 기준을 검토한 뒤 별도로 수행하며 전체 DB를 즉시 덮어쓰지 않는다.

## 실제 sync 결과

새 EMS image에서 `--playlist-limit 2 --request-budget 24 --request-timeout 8`을 명시했다.

| slug | dry-run discovered/joined/stored | actual discovered/joined/stored | DB membership | API track |
|---|---:|---:|---:|---:|
| `new-releases` | 39/12/0 | 39/12/12 | 12 | 12 |
| `seasonal-jazz` | 38/12/0 | 38/12/12 | 12 | 12 |
| `night-rnb` | 39/12/0 | 39/12/12 | 12 | 12 |
| `feel-good` | 34/12/0 | 34/12/12 | 12 | 12 |
| `focus` | 26/12/0 | 26/12/12 | 12 | 12 |

- `(section_id, track_id)` 중복 `0`, 5개 active section 간 track 중복 `0`, inactive/orphan track 참조 `0`이다.
- inactive `temporary-*` section 5개의 membership은 각각 12곡으로 유지됐다. 전체 membership은 `120`이다.
- screen active assignment는 EMS `5`, Home `3`으로 유지됐다.
- 사용자, TIDAL 연결, 플레이리스트, 저장 트랙, 가져오기, 좋아요, 취향 프로필과 중심 count는 모두 불변이다.
- target resolver run은 `paused`, `matched_count=130`으로 유지됐다.

## 배포와 smoke

- 검토한 Web/EMS image를 `current`로 태깅하고 release symlink를 원자 전환했다.
- Web만 `--no-deps --no-build --force-recreate`로 교체했다.
- `ems-pipeline` container ID `7312158fc9b0...`, `ems-source-routines` container ID `d5e6f27110e6...`와 각 image ID·시작 시각은 전환 전후 동일하다.
- local/public `/api/health/ready`, `/api/ems/sections?region=KR&limit=12&sectionLimit=5`, `/`, `/ems`는 모두 HTTP 200이다.
- local/public sections API는 모두 5개 slug × 12곡을 반환했다.
- Melon 작업은 sync 동안만 일시정지했고 최종 `running/discovering`, fresh heartbeat를 확인했다.

## 테스트와 제약

- EMS pipeline 전체: `56 passed`.
- Web editorial 계약 focused Vitest: `24 passed`.
- Web production build와 ESLint는 통과했다. ESLint는 기존 warning 5건, error 0건이다.
- Web 전체 Vitest는 `90 files passed / 3 failed`, `367 tests passed / 4 failed`다. 실패는 이번 Python 변경과 Web diff가 없는 기존 Home copy 기대 1건과 recommendations/likes mock 경계 3건이며 release 전 새 회귀로 판정하지 않았다.
- 실제 로그인 브라우저에서 Home top 3와 EMS 5개 rail의 시각·재생 동작 확인은 이번 HTTP smoke 범위에 포함하지 않았다.
