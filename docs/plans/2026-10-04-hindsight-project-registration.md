# Hindsight 프로젝트 등록 계획

## 요청과 범위

사용자 요청에 따라 Music Pie를 로컬 Hindsight에 등록한다. 기존 `approid-desk`, `hotelChainManager`와 분리된 `music-pie` 뱅크를 사용한다. 프로젝트 목적·기능·실제 구현 스택·문서상 배포 기준·작업 규칙·확인된 제한을 저장한다. 인증 정보, 개인 이력서, 다른 프로젝트 데이터는 입력하지 않는다.

## 변경 순서

1. 로컬 `http://127.0.0.1:8888/openapi.json`의 Hindsight 0.10.2 API와 기존 뱅크 목록을 확인한다.
2. `docs/changes/2026-10-04-hindsight-project-snapshot.md`를 근거 문서와 대조해 작성한다.
3. 전용 뱅크를 생성하고 고정 문서 ID `music-pie-project-registration-2026-10-04`로 비동기 retain한다. 클라이언트 operation UUID를 재사용해 불명확한 응답의 중복 제출을 방지한다.
4. 작업 완료, 원문 재조회, recall 검색, 기존 뱅크 보존을 검증하고 결과를 변경 기록에 남긴다.

## 사전 완료 기준

- H1: 등록 원고의 8개 섹션과 근거 경로가 존재하고, 목적·사이트·저장소·스택·최근 배포·기능·제한·작업 규칙이 사용자 지시 및 문서와 일치한다. 인증 비밀값과 개인 이력서 내용이 없다.
- H2: `music-pie` 뱅크가 하나이고 retain operation이 `completed`, 고정 ID 문서가 하나이며 `original_text`가 원고와 정확히 일치하고 추출된 memory가 1개 이상이다.
- H3: `music-pie` 뱅크에서 프로젝트 목적·EMS/GMS/MMS·사용자별 추천 제외를 recall해 등록 문서의 memory가 반환된다.
- H4: 기존 두 뱅크의 ID·설정 갱신 시각·fact count가 등록 전후 동일하고, 변경 파일은 이번 등록 문서이며 `git diff --check`가 성공한다.

## 검증 범위

배포 현황과 제품 테스트는 기존 변경 기록의 날짜가 있는 사실로 저장하며 이번 등록 작업의 실행 결과로 주장하지 않는다. 필수 검증은 Hindsight 등록·조회·검색·프로젝트 분리에 한정한다.
