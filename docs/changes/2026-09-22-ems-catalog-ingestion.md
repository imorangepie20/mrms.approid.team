# EMS 공용 카탈로그 수집 기반 배포 기록

## 이유와 범위

MusicBrainz 공식 CC0 snapshot에서 1,000곡 후보를 결정적으로 선별하고, EMS 스키마·API·resolver 컨테이너를 Zorin 운영 스택에 배포했다. 기존 사용자 라이브러리와 추천 데이터는 변경하지 않았다.

## 개발 PC에서 확인한 산출물

- Core snapshot: `20260919-002047`, `mbdump.tar.bz2` SHA-256 `2811a5c96de306ae9c54264c424a9a00618cf2c382b43588927705e5b55994b6`.
- Canonical snapshot: `20260917-080002`, SHA-256 `04a30bd748013851145c352f5a4c73f1bc3742a15a87eda413a50abd7610e1ed`.
- 후보 artifact: 1,000행, selector `ems-v1`, seed `17`, 후보 gzip SHA-256 `ace012b5dbb437f71039be39ac807cf2ffb27d76bbb969c728deb03cf40056bf`.
- Core 선택 추출은 스트리밍 tar 순회로 완료했다. 원본 dump와 추출물은 저장소 밖 `C:\Users\jowoo\MusicPieData\musicbrainz`에만 보관했다.

## 코드·검증

- `008_ems_catalog.sql`을 Zorin PostgreSQL 컨테이너에 `ON_ERROR_STOP=1`로 적용했다.
- `services/ems-pipeline` 테스트: `22 passed`.
- Web 테스트: `74 files, 300 tests passed`; lint와 Next.js build 통과.
- Zorin Docker build: `music-pie-web:current`, `music-pie-ems-pipeline:current` 생성 성공.
- 후보 매니페스트 검증: `run_id=canary-1k`, `row_count=1000`, checksum 일치, `dry_run=true`.

## 후속 bounded canary

- 전체 canonical CSV를 다시 스캔하지 않도록 앞 200,000행만 제한 처리했다. CPU 과부하를 유발한 전체 스캔은 중단했고, 원본 7.66GB CSV는 변경하지 않았다.
- 지역 매핑 결과가 있는 111,720행에서 selector를 실행했으며, 아티스트 cap 규칙 때문에 US 후보 182행이 생성됐다. 이 bounded 표본에는 KR 후보가 포함되지 않아 전체 지역 대표성으로 간주하지 않는다.
- 신규 artifact `20260917-080002-kr-us-200k`의 후보 gzip SHA-256은 `043f6c9aacc8f67348dfcc6fb492595cb061326afc3075539c92fb69142686b5`다. artifact와 manifest는 저장소 밖 로컬 데이터 디렉터리와 Zorin shared 경로에만 둔다.
- 기존 resolver가 TIDAL v2 `/searchResults/{query}`를 리소스 ID로 호출해 `400 INVALID_RESOURCE_ID`를 받던 문제를 `filter[query]`·`include=tracks,tracks.artists,tracks.albums` 호출로 수정했다. v2의 문자열 `availability` 형식도 처리한다.
- run CLI의 commit 누락을 수정해 resolver 상태와 run 상태가 실제 DB에 저장되도록 했고, `--max-batches` bounded 실행은 `paused`로 기록한다.
- 신규 run `a352caf9-2be9-444b-971a-0bd864752832`에서 10곡 canary를 실행했다. 현재 DB 상태는 `not_found=19`, `pending=163`, `matched=0`이며, 1,000곡 전체 실행은 품질 게이트 전까지 보류한다.

## Zorin 결과

- 배포 release: `690101de4b20`, `/home/approid/apps/music-pie/releases/690101de4b20`.
- `music-pie-postgres`, `music-pie-embedding`, `music-pie-web`, 기존 tunnel이 healthy/running 상태다.
- 로컬·공개 `/api/health/live`, `/api/health/ready`, `/ems`, 공개 `/api/ems/catalog` 모두 HTTP 200.
- DB 보존 확인: `app_users=1`, `music_tracks=101`, `ems_ingest_runs=0`, `ems_tracks=0`.
- EMS cursor secret은 Zorin secret 디렉터리에서 새로 생성했으며 값은 로그나 저장소에 기록하지 않았다.

## 미검증·보류

- Zorin에 TIDAL Client Credentials를 추가하고 token smoke는 통과했다. bounded live canary는 실행했지만 `matched=0`으로 남아 1,000곡 전체 resolve/import와 실제 `STREAM` 승격은 보류했다.
- 후속 release `d1b7f5d`에 tracked `apps/web/scripts/migrate.mjs`와 `tools` profile을 추가했고, Zorin에서 `--baseline-through=008_ems_catalog.sql` 실행 결과 `0 pending migrations applied`를 확인했다.
- `ems-pipeline` 기본 CMD는 health gate 출력만 하므로 live worker를 시작하지 않았다. resolver loop·embedding enqueue를 구현하고 카탈로그용 자격 증명을 주입한 뒤 활성화한다.
- 로컬 Windows에서는 Zorin 절대 `env_file` 경로 때문에 Compose config를 실행하지 않았고, Zorin에서 `docker compose ... config --quiet`가 통과했다.

## 다음 작업

1. bounded 표본의 KR 후보 부족 원인을 확인하고, CPU 제한형 샘플 확장 방식을 승인한다.
2. 1,000곡 순차 resolve 전 20곡 품질 canary에서 `matched`, `not_found`, `unavailable` 비율을 확인한다.
3. false-match 1% 미만, rollback rehearsal, embedding completion을 확인한다.
4. 결과 승인 뒤 10,000곡 gate와 snapshot diff scheduler를 시작한다.
