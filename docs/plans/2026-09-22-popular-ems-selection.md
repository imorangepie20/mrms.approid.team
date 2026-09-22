# 대중성 우선 EMS 1,000곡 선별 계획

## 이유와 완료 기준

- MusicBrainz `canonical_score`는 100만 행 중 대부분이 같은 값이라 대중성 순위로 사용할 수 없다.
- MusicMoveArr TIDAL torrent는 최신 파일의 피어가 없어 실제 다운로드가 진행되지 않았다.
- ListenBrainz 상위곡은 특정 팬덤 편향과 KR 스트리밍 불가 비율이 높아 20곡 카나리에서 `matched=7`, `unavailable=13`이었다.
- TIDAL 공개 에디토리얼 플레이리스트의 팔로워 수, 트랙 `popularity`, 여러 플레이리스트 중복 노출을 대중성 신호로 사용한다.
- KR `STREAM` 가능·ISRC 보유·30초 이상인 곡만 포함하고 아티스트·앨범별 최대 5곡으로 제한한다.
- 정확히 1,000행 artifact를 생성하고 20곡 TIDAL bounded canary 매칭률 80% 이상을 확인한다.

## 변경 순서

1. `tidal_popularity.py`에서 공개 에디토리얼 플레이리스트를 검색하고 인기 후보를 결정적으로 선별한다.
2. artifact manifest에 내부 TIDAL source 표기를 허용하고 빈 MusicBrainz MBID는 `NULL`로 stage한다.
3. 같은 ISRC의 여러 에디션은 KR 스트리밍 가능 여부, 제목·아티스트, 재생시간, 앨범, TIDAL ID 순으로 하나를 고른다.
4. 1,000행 artifact의 checksum·중복·cap을 확인한다.
5. Zorin에서 20곡 bounded canary를 실행하고 결과를 문서화한다.

## 완료 결과

- TIDAL 공개 에디토리얼 212개 중 팔로워 상위 40개에서 KR 스트리밍 가능 고유 ISRC 3,685개를 확보했다.
- artifact `tidal-editorial-20260922`: 1,000행, 고유 key/ISRC 각 1,000개, artist/album 최대 5곡.
- 결정적 gzip SHA-256: `5a054406e080ed96e04d88cf525a2050342fa003e172d8871ddf256c798a2f9d`. 같은 입력을 두 번 기록해 같은 checksum임을 확인했다.
- 최종 bounded run `91280cc8-5fdd-494d-82db-6d573ea576de`: 최초 `matched=15`, `retryable=5`; 재시도 후 나머지 5곡도 모두 matched. 최종 20/20(100%), ambiguous/not_found/unavailable 0.
- 전체 1,000곡 처리는 이번 범위에서 시작하지 않고 run을 `paused`로 유지한다.

## 검증

- `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests` → `37 passed`
- manifest checksum과 실제 gzip SHA-256 일치
- artifact row 1,000, unique key 1,000, unique ISRC 1,000, artist/album max 5
- `git diff --check`
