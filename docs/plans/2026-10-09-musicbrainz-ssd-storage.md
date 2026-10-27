# MusicBrainz 저장소 SSD 이전 계획

## 요청과 원인

- 사용자가 연결해 둔 SSD를 활용해 MusicBrainz `disk_gate`를 해소한다.
- 운영 `/` 파일시스템의 실제 사용량은 약 171.82GiB/233.18GiB(73.68%)다. core는 25GiB, metadata는 2GiB 예약 공간까지 포함해 70% 미만이어야 한다.
- SSD `/dev/sda1`은 UUID `9d63d07a-28bd-441d-91b7-b29efa3c3313`, ext4, `/mnt/external-ssd`이며 `/etc/fstab`에 자동 마운트되어 있다. 기존 SSD의 `backups` 등은 변경하지 않는다.

## 설계와 순서

1. 기존 서비스 image ID·container ID·마운트·자료 목록을 저장소 밖 운영 증거 디렉터리에 기록한다.
2. source-routines만 중지해 MusicBrainz 파일 쓰기를 멈춘다.
3. 기존 MusicBrainz 전체를 `/mnt/external-ssd/music-pie/musicbrainz`로 복사한다. 파일 SHA-256, 링크, 모드, 소유권을 대조한다. 일치 전 원본은 제거하지 않는다.
4. `infra/compose.zorin.yml`의 해당 bind mount만 SSD 경로로 변경한다. `create_host_path: false`로 SSD 경로 부재 시 내부 디스크에 자동 생성되는 것을 막는다.
5. 운영에는 같은 내용을 전용 override로 적용하고 기존 실행 image를 유지해 source-routines만 재생성한다. 기존 release source는 수정하지 않는다.
6. 무결성이 검증된 원본 디렉터리만 정리해 내부 디스크 용량을 확보한다. 경로를 다시 검증한 뒤 정리한다. SSD 복사본은 보존한다.
7. 기존 활성화·주기·후보 처리 정책은 유지하고 `disk_gate` 해소와 기존 서비스 보존을 검증한다. 멜론 오류는 별도 범위다.
8. 재기동 후 기존 enabled·failed·disk_gate 조건에 해당하는 core·metadata의 다음 확인 시각만 앞당겨 재시도를 예약한다. 오류 코드를 수동으로 지우거나 paused run을 재개하지 않는다.

## 완료 기준과 검증

- V1 SSD: UUID·ext4·fstab 일치 및 변경된 Compose의 `create_host_path: false`, 운영 Compose `config --quiet` 종료 코드 0.
- V2 무결성: 이전 전후 모든 파일의 SHA-256·크기·모드·소유권·링크 대조 결과 불일치 0.
- V3 저장 경로: 새 source-routines의 실제 `/data/musicbrainz` mount가 SSD 전용 경로이며 데이터 읽기와 소유권 확인 성공.
- V4 디스크: 내부 디스크 사용량 감소 및 실행 image의 core·canonical·metadata disk gate 모두 통과.
- V5 서비스: source-routines 정상 실행·restart 0, 이전된 snapshot 읽기 및 기존 활성 루틴의 디스크 차단 해소 확인.
- V6 범위: 비대상 컨테이너 ID 보존, Web readiness HTTP 200, 요청 외 저장소 diff 없음.

## 복구

- 원본 정리 전 실패하면 override를 제거하고 기존 source-routines image와 mount로 복귀한다.
- 원본 정리 후에는 source-routines를 중지하고 검증된 SSD 자료를 기존 위치로 복사한 뒤 원래 Compose로 복귀한다. 내부 디스크 용량을 먼저 확인한다.
- DB, 비밀값, SSD 기존 파일 및 다른 서비스는 이전하지 않는다. 원본 dump나 비밀값을 저장소에 기록하지 않는다.

## 결과 기록

- 실행 결과와 미검증 항목은 `docs/changes/2026-10-09-musicbrainz-ssd-storage.md`에 기록한다.
