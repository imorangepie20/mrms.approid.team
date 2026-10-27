# ems-source-routines 중단 원인 조사

2026-10-27 Web 배포 전 inventory에서 `music-pie-ems-source-routines-1`이 `Exited (127)`로 멈춰 있는 것을 발견해 원인을 조사하고, 사용자 요청으로 복구와 재발 방지를 적용했다.

## 결론

외장 SSD(`/dev/sda1`, SanDisk Portable SSD, UUID `9d63d07a-28bd-441d-91b7-b29efa3c3313`)가 `/mnt/external-ssd`에 마운트되지 않은 상태라, 이 경로를 `create_host_path: false`로 bind하는 source-routines container가 시작될 수 없다.

## 근거(서버 조회 결과)

- container: `StartedAt 2026-10-24 23:23:15 KST`, `FinishedAt 23:28:36 KST`, exit 127, OOM false, RestartCount 0, 정책 `unless-stopped`. 마지막 로그는 MusicBrainz `20261021-002201` 메타데이터 반영 결과다.
- 부팅 기록(`journalctl --list-boots`): 10-24 23:18 이후 23:28, 10-25 02:17, 08:46, 08:52, 10:13에 재부팅했고, 이전 부팅들에는 정상 종료 기록(`systemd-shutdown`, docker 정지)이 없다. 23:28 재부팅 직후 4초 뒤 container 종료가 기록됐다. exit 127은 비정상 재부팅 뒤 Docker가 남긴 값으로 보이며 애플리케이션 오류 근거는 찾지 못했다(추정).
- 10-25 08:46 부팅: `Dependency failed for mnt-external\x2dssd.mount`(장치 대기 실패) → dockerd `failed to start container ... open /mnt/external-ssd/music-pie/musicbrainz: no such file or directory`. 시작 실패는 Docker 재시작 정책으로 재시도되지 않는다.
- 현재 부팅(10-25 10:13): mount unit `inactive (dead)`. SSD device unit은 `active (plugged) since 2026-10-25 10:56:15 KST`로, 부팅 43분 뒤에야 장치가 인식됐다. fstab은 `defaults,nofail,x-systemd.device-timeout=10`이라 부팅 때 10초 안에 장치가 없으면 마운트를 건너뛰고, 나중에 장치가 붙어도 자동으로 마운트하지 않는다.
- 같은 이유로 사용자 systemd의 `backup-to-external-ssd.service`도 10-25 01:02, 07:47, 10-26 03:09, 10-27 03:02에 `External SSD is not mounted ...; skipping`으로 건너뛰었다.

## 영향

- 10-24 23:28 이후 EMS 소스 루틴(MusicBrainz 메타데이터 등) 실행이 멈췄다.
- 홈 디렉터리 SSD 백업도 같은 기간 실행되지 않았다.
- Web·ems-pipeline·postgres 등 나머지 서비스는 SSD에 의존하지 않아 정상이다.

## 복구(2026-10-27 적용)

- 09:29 사용자가 sudo로 `fsck -n /dev/sda1` → `systemctl start 'mnt-external-ssd.mount'` → container 시작을 실행했다. 마운트 때 `systemd-fsck`가 `저널 복구중` 후 `external-ssd: clean`을 보고했고 `EXT4-fs (sda1): mounted ... r/w`로 마운트됐다(916G 중 113G 사용).
- 09:32 사용자가 sudo로 `shared/artifacts/20261027-ssd-routines-recovery/recover.sh`를 실행했다. 이미 마운트된 상태라 fsck 단계는 건너뛰었고(`ALREADY_MOUNTED`), `MOUNT_PASS`·`UNIT_PASS`로 끝났다. 로그는 같은 폴더 `recover.log`.

## 재발 방지(2026-10-27 적용)

`x-systemd.automount`만으로는 이번 사례를 막지 못한다. Docker는 부팅 직후 container를 시작하고, 그 시점에 SSD가 없으면 시작 실패 후 다시 시도하지 않기 때문이다. 대신 SSD 장치가 나타날 때마다 마운트와 container 시작을 하는 system unit을 추가했다.

- `/etc/systemd/system/music-pie-ssd-routines.service`(저장소 사본 `infra/systemd/music-pie-ssd-routines.service`): `RequiresMountsFor=/mnt/external-ssd/music-pie/musicbrainz`, `After=docker.service`, `ExecStart=/usr/bin/docker start music-pie-ems-source-routines-1`, `WantedBy=` SSD UUID device unit
- 확인: `systemd-analyze verify` 통과, `is-enabled`=enabled, device unit `Wants=music-pie-ssd-routines.service`, unit `Requires`에 `mnt-external-ssd.mount` 포함, 첫 실행 `status=0/SUCCESS`
- 되돌리기: `sudo systemctl disable --now music-pie-ssd-routines.service && sudo rm /etc/systemd/system/music-pie-ssd-routines.service && sudo systemctl daemon-reload`

## 복구 후 확인

- container `running`, restart 0, 프로세스 `python -m ems_pipeline.cli serve-source-routines`
- `ems_source_routines`: `musicbrainz_canonical` 09:29 확인 후 `idle`(다음 10-28 09:29). `musicbrainz_core`는 09:29부터 새 dump `20261024-102842`를 SSD에 내려받는 중(09:34 기준 `mbdump.tar.bz2.part` 2.93GB). `musicbrainz_metadata`는 core 다음 순서로 처리된다.

## 미확인·다음 작업

- 10-24~25 반복 재부팅 원인(전원·하드웨어·수동 재부팅 여부)은 조사하지 않았다. 커널 로그 접근(`dmesg`)은 sudo 없이 막혀 있다.
- SSD가 부팅 43분 뒤에 인식된 이유(USB 전원·케이블·허브)는 확인하지 않았다.
- 실제 재부팅·SSD 재연결 상황에서 새 unit이 동작하는지는 아직 확인하지 않았다. 다음 재부팅 뒤 `systemctl status music-pie-ssd-routines.service`와 container 상태를 확인한다.
- `musicbrainz_core` 다운로드·적재와 이어지는 `musicbrainz_metadata` 완료는 확인하지 않았다.
- 화면의 `melon_genres` 수집 run(10-26 18:02 시작, `running`)은 이번 장애와 별개이며 조사하지 않았다.
