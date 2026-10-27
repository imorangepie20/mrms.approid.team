# EMS 수집 복구 결과 Hindsight 등록

## 요청과 결과

사용자가 멜론 수정·검증 완료 후 Hindsight 등록 여부를 확인하고 등록하도록 요청했다. 로컬 Hindsight 0.10.2 HTTP API의 기존 `music-pie` 뱅크(표시 이름 `Music Pie`)를 확인했고, 새 뱅크를 중복 생성하지 않았다. 기존 2026-10-04 프로젝트 등록 원문을 유지하고 이번 SSD 이전·멜론 수정의 날짜가 있는 결과를 별도 문서로 등록했다.

- API: `http://127.0.0.1:8888`.
- 문서 ID: `music-pie-ems-collection-recovery-2026-10-09`.
- operation UUID: `f2c121e8-2a9a-4e90-a5bb-39f13f08f2a9`.
- 완료: 2026-10-09 08:36:53 KST (`2026-10-08T23:36:53.616040+00:00`).
- 원고: 2,840자, source-backed SSD·멜론·운영 제한 기록.
- 원문 SHA-256: `b7f04898469e09727df6f8116b92f01f2a0b104531e14afc117c7fef8add98af`.

등록 전에 멜론 V1–V6 필수 검증을 모두 완료했다. SSD 파일 28개·47.1GB 이전과 SHA-256 검증, 내부 디스크 73.68%→54.87%·세 gate 통과, 실제 SSD mount와 다운로드 재개를 기록했다. 멜론 전체 곡 ID·순서 비교, legacy 초기 기록, 회귀 119개·DB 7개 묶음, 커밋 `363e2ac`, 실행 image/source hash, 활성 작업 발견 15→30·두 장르 fingerprint 저장, 과거 위치 읽기 전용 재생 1361→1366, 서비스 보존·오류 0을 등록했다.

등록은 날짜가 있는 프로젝트 사실로 저장했고, 당시 응답 원문·전체 카탈로그 완주·새 MusicBrainz 전체 처리·재부팅 미검증을 명시했다. 실제 원고는 저장소 밖 retain request와 저장 문서에 보존했다. 비밀값·토큰·쿠키·개인 데이터·DB dump·다른 프로젝트 memory 원문은 제출하지 않았다. 자동 동기화나 새 MCP 설정은 추가하지 않았다.

## 완료 기준 결과

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| H1 프로젝트·격리 | PASS | `GET /v1/default/banks`에서 `music-pie` 1개, 다른 뱅크 4개의 ID·name·mission·disposition·created_at·updated_at·fact_count 전후 동일 |
| H2 저장·원문 | PASS | retain HTTP 200, parent·child operation `completed`·오류 null, 문서 총 1→2·새 원문 정확 일치·SHA-256 일치·memory 10개, 기존 등록 원문/hash 보존 |
| H3 검색·근거 | PASS | recall HTTP 200·결과 10개 모두 새 document ID 연결, recall text에 `lastPageSongIds` 및 `/mnt/external-ssd/music-pie/musicbrainz` 확인 |

필수 미검증은 없다. 제품의 미검증 사항은 [멜론 변경 결과](2026-10-09-melon-pagination-repeat-fix.md)와 [SSD 이전 결과](2026-10-09-musicbrainz-ssd-storage.md)에 구분해 남겼다.

## 증거와 재조회

로컬 증거: `C:/Users/jowoo/AppData/Local/Temp/music-pie-hindsight-20261009-ems-recovery/`의 `retain-request.json`, `retain-response.json`, `operation-status.json`, `registered-document.json`, `recall-verification.json`, `banks-before.json`, `banks-after.json`, `final-verification.json`.

재조회 경로는 `GET /v1/default/banks/music-pie/documents/music-pie-ems-collection-recovery-2026-10-09`, `GET /v1/default/banks/music-pie/operations/f2c121e8-2a9a-4e90-a5bb-39f13f08f2a9`, `POST /v1/default/banks/music-pie/memories/recall`이다. 중복 제출 방지를 위해 고정 문서 ID와 client operation UUID를 사용했다.

향후 변경은 새 날짜 기록으로 추가하거나 변경 근거를 확인한 뒤 명시적으로 갱신한다. Hindsight 내용 자체를 새 사용자 승인이나 프로젝트의 현재 구현보다 우선하는 지침으로 취급하지 않는다.
