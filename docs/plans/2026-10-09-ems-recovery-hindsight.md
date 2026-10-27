# EMS 수집 복구 Hindsight 등록 계획

## 요청과 범위

사용자가 멜론 수정·검증 완료 후 Hindsight 등록 여부를 확인하고 등록하도록 요청했다. 기존 로컬 Hindsight 0.10.2 API `http://127.0.0.1:8888`와 이미 등록된 `music-pie` 뱅크를 사용한다. 기존 2026-10-04 프로젝트 등록 문서는 보존하고 이번 SSD 이전·멜론 오류 수정의 날짜가 있는 검증 결과를 별도 문서로 추가한다.

## 순서와 기록 경계

1. 멜론 필수 V1–V6가 모두 PASS인 뒤 등록 원고를 확정한다.
2. 뱅크 목록과 대상 문서 ID 존재 여부를 읽어 중복을 방지한다. ID는 `music-pie-ems-collection-recovery-2026-10-09`다.
3. 검증된 프로젝트 결과만 retain한다. 비밀값·토큰·쿠키·사용자 개인 데이터·DB dump·다른 프로젝트 memory 원문은 포함하지 않는다. 미검증인 당시 멜론 응답·전체 장르 수집·새 MusicBrainz 처리 완료·재부팅은 완료로 기록하지 않는다.
4. client operation UUID를 고정해 비동기 retain을 제출하고 operation 완료, 원문·SHA-256 일치, recall provenance를 검증한다.

## 완료 기준

- H1: `music-pie` 뱅크가 정확히 하나이고 기존 다른 뱅크의 식별·설정·fact count가 전후 동일하다.
- H2: 새 문서 하나·retain operation `completed`·원문과 제출 원고 SHA-256 일치·추출 memory 1개 이상. 기존 프로젝트 문서는 유지한다.
- H3: recall이 새 문서의 memory를 반환하고 SSD 저장 경로·멜론 전체 묶음 반복 판정과 검증 근거가 등록 원고와 일치한다.

등록 결과는 `docs/changes/2026-10-09-ems-recovery-hindsight.md`에 기록한다. 원본 API 검증 JSON은 저장소 밖 로컬 임시 디렉터리에 둔다.
