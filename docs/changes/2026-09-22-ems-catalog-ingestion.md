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
- `services/ems-pipeline` 테스트: `18 passed`.
- Web 테스트: `74 files, 300 tests passed`; lint와 Next.js build 통과.
- Zorin Docker build: `music-pie-web:current`, `music-pie-ems-pipeline:current` 생성 성공.
- 후보 매니페스트 검증: `run_id=canary-1k`, `row_count=1000`, checksum 일치, `dry_run=true`.

## Zorin 결과

- 배포 release: `ce9cda8`, `/home/approid/apps/music-pie/releases/ce9cda8`.
- `music-pie-postgres`, `music-pie-embedding`, `music-pie-web`, 기존 tunnel이 healthy/running 상태다.
- 로컬·공개 `/api/health/live`, `/api/health/ready`, `/ems`, 공개 `/api/ems/catalog` 모두 HTTP 200.
- DB 보존 확인: `app_users=1`, `music_tracks=101`, `ems_ingest_runs=0`, `ems_tracks=0`.
- EMS cursor secret은 Zorin secret 디렉터리에서 새로 생성했으며 값은 로그나 저장소에 기록하지 않았다.

## 미검증·보류

- Zorin에 TIDAL Client Credentials가 없으므로 1,000곡 live resolve/import와 실제 `STREAM` 검증은 실행하지 않았다. 현재 후보는 dry-run artifact로만 전달됐다.
- standalone 이미지에 계획서의 `migrate.mjs`가 포함되어 있지 않아 008 migration은 임시 SQL을 PostgreSQL 컨테이너에 직접 적용했다. 다음 작업에서 tracked migration runner와 운영용 stage/worker 명령을 추가해야 한다.
- `ems-pipeline` 기본 CMD는 health gate 출력만 하므로 live worker를 시작하지 않았다. resolver loop·embedding enqueue를 구현하고 자격 증명을 주입한 뒤 profile로 활성화한다.
- 로컬 Windows에서는 Zorin 절대 `env_file` 경로 때문에 Compose config를 실행하지 않았고, Zorin에서 `docker compose ... config --quiet`가 통과했다.

## 다음 작업

1. 운영자가 승인한 TIDAL Client Credentials를 `shared/secrets/ems.env`에 추가한다.
2. stage/checkpoint/worker loop와 migration runner를 구현·테스트한다.
3. 1,000곡 순차 resolve 후 false-match 1% 미만, rollback rehearsal, embedding completion을 확인한다.
4. 결과 승인 뒤 10,000곡 gate와 snapshot diff scheduler를 시작한다.
