# MusicBrainz 저장소 SSD 이전

## 이유와 결과

사용자가 추가 SSD를 활용해 MusicBrainz `disk_gate`를 해결하도록 요청했다. 시스템 파일시스템 사용률 73.68% 때문에 core 25GiB·metadata 2GiB의 예약 공간을 포함한 70% 기준을 넘었다.

- 기존 `/home/approid/apps/music-pie/shared/musicbrainz`의 자료를 `/mnt/external-ssd/music-pie/musicbrainz`로 이전했다.
- 28개 일반 파일, 47,095,366,158바이트(약 43.86GiB)의 SHA-256을 복사 중 원본에서 계산하고 복사본을 다시 읽어 대조했다. 14개 디렉터리와 모든 파일의 모드·UID·GID도 일치했다. 심볼릭 링크는 0개다.
- GPG 실행용 UNIX socket 5개는 프로세스 재기동 시 재생성되므로 복사 대상에서 제외했다. 키·설정 등 일반 파일은 보존했다.
- 무결성·경로·SSD filesystem 확인 후 검증된 내부 디스크 원본만 정리했다. SSD 기존 `backups` 등은 변경하지 않았다.
- 내부 디스크는 사용 127.96GiB/233.18GiB(54.87%), 가용 93.31GiB가 되었다. SSD는 사용 110.05GiB/915.81GiB(12.02%), 가용 796.43GiB다. 이후 기존 수집이 진행되면 SSD 사용량은 증가할 수 있다.
- core·canonical의 현재 `/` 기반 gate와 metadata의 작업 경로 기반 gate가 모두 통과했다. 70% 기준과 예약 공간은 변경하지 않았다.

## 설정과 운영 적용

- `infra/compose.zorin.yml`의 source-routines bind mount를 SSD 전용 경로로 변경했다. `create_host_path: false`로 SSD 자료 경로가 없을 때 내부 디스크에 빈 디렉터리가 자동 생성되는 것을 막는다.
- 운영 current release source는 수정하지 않았다. `/home/approid/apps/music-pie/shared/compose.musicbrainz-ssd.yml`의 storage override를 적용했다.
- 당시 `music-pie-ems-pipeline:current` image ID는 실행 중 source-routines와 달랐다. 이번 기동에만 `activation-image.yml`을 추가해 실행 중이던 image `sha256:a0dc7fa89697628146172a76fb04f0871f1e1dbb382694e1ad5a9211f0924989`를 보존했다. 해당 image에 `music-pie-ems-pipeline:ssd-storage-20261009` tag를 추가했다. 향후 업데이트에서 activation override를 재사용하지 않는다.
- source-routines만 중지·재생성했다. DB schema·개인 데이터·비밀값·기타 서비스는 이전하지 않았다.
- 재기동 후 enabled이며 `failed / disk_gate`인 core·metadata 두 루틴의 `next_check_at`만 2026-10-09 08:15:39 KST로 앞당겼다. enable·주기·후보·paused run·요청 한도는 변경하지 않았다. 오류 코드를 수동으로 지우지는 않았다.
- 실제 core 상태가 `downloading`으로 전환됐고 SSD의 `20261007-002147/mbdump.tar.bz2.part`가 307,232,768→704,643,072바이트로 증가했다. metadata는 재시도가 예약되어 있으며 source-routines의 순차 처리 대기 상태다. 이전 `disk_gate` 값은 각 루틴 성공 시 `_mark_check`에서 갱신된다.

## 검증

운영 증거 디렉터리는 `/home/approid/apps/music-pie/shared/artifacts/20261009-musicbrainz-ssd`다. 검증 명령은 `ssh -o BatchMode=yes -o ConnectTimeout=8 approid@192.168.219.174 'python3 /home/approid/apps/music-pie/shared/artifacts/20261009-musicbrainz-ssd/verify-final.py'`이며 첫 전체 검증 종료 코드는 0이다.

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| V1 SSD·설정 | PASS | UUID `9d63d07a-28bd-441d-91b7-b29efa3c3313`, ext4·fstab 일치, `compose-verification.json`의 `create_host_path=false`, Compose `config --quiet` 종료 0 |
| V2 자료 무결성 | PASS | `copy-verification.json`·`metadata-verification.json`: 파일 28개·디렉터리 14개, SHA-256·크기·모드·소유권 불일치 0 |
| V3 실제 저장 경로 | PASS | `final-verification.json`: `/data/musicbrainz`의 Source가 SSD 전용 경로, 기존 snapshot 읽기·작업 경로 쓰기 권한 확인 |
| V4 디스크 차단 | PASS | 시스템 54.87%, SSD 12.02%, 실행 image의 core·canonical·metadata gate 모두 `true` |
| V5 서비스 | PASS | source-routines `Running=true`, `RestartCount=0`, 이전 image ID 일치·snapshot 읽기 성공; `routine-retry-verification.json`에서 core `downloading`·SSD 다운로드 704,643,072바이트 확인 |
| V6 범위 보존 | PASS | 비대상 컨테이너 67개 ID 동일·모두 실행 중, Web readiness HTTP 200; `git diff --check` 종료 0 |

재시도 예약과 문서 변경 이후 전체 V1–V6를 다시 실행해 모두 PASS·종료 코드 0을 확인했다. 새 계획·변경 문서 참조 2/2와 요청 범위의 diff도 확인했다. 기존 사용자 변경 `docs/harness/skill-plugin-environment.md`와 기존 미추적 파일은 보존했다.

## 미검증과 다음 작업

- 실제 서버 재부팅·SSD 분리 테스트는 수행하지 않았다. fstab·실제 UUID·경로 부재 시 자동 생성 금지를 검증했다.
- 새 MusicBrainz 버전의 전체 다운로드·추출·후보 처리 완료는 SSD 이전의 완료 기준과 별개이며 상시 루틴으로 진행한다. 마지막 `disk_gate` 표시는 루틴의 다음 성공 확인까지 남을 수 있다.
- 멜론 `melon_pagination_repeated`는 별도 오류이며 이번 변경 대상이 아니다.
- SSD 분리·재부팅 이후에는 mount·snapshot 읽기·disk gate를 다시 확인한다. 복구 절차는 [이전 계획](../plans/2026-10-09-musicbrainz-ssd-storage.md)에 있다.
