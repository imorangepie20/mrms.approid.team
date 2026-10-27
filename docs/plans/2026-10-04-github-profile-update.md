# GitHub 프로필 Music Pie 추가 계획

## 요청과 범위

사용자가 지정한 `https://github.com/imorangepie20` 프로필을 업데이트한다. 공개 프로필 전용 저장소 `imorangepie20/imorangepie20`의 README를 수정한다. 기존 B2B-STM, 경력·연락처·이미지를 보존하고 Music Pie를 대표 프로젝트로 추가한다. 새로운 서비스·저장소 링크, 실제 기능과 기술 스택, 날짜를 명시한 검증 근거, 제한 하이브리드를 반영한다. 계정 보안·개인 설정이나 Music Pie 운영 환경은 변경하지 않는다.

## 순서

1. 프로필 저장소와 공개 페이지·기존 원문을 읽는다.
2. README 초안 및 실제 제품 화면을 준비하고 근거·기존 내용 보존·링크를 검증한다.
3. 사용자 프로필 업데이트 요청에 따라 README·이미지 변경만 커밋하고 push한다.
4. 원격 커밋과 README 원문, 공개 프로필의 렌더링을 확인한다.

## 사전 완료 기준

- P1: Music Pie 목적·주요 기능·스택·조건·날짜가 기존 프로젝트 기록과 일치하며 연결할 코드·문서 경로가 존재한다.
- P2: 기존 B2B 본문·경력 주요 내용·연락처·기존 이미지가 보존되고 변경 파일은 README와 새 Music Pie 이미지로 한정된다. `git diff --check` 성공.
- P3: 서비스·저장소·추가 근거 링크와 새 이미지가 조회되며, 원격 main 커밋 및 README가 최종 수정 원문과 일치한다.
- P4: 공개 프로필에 Music Pie와 기존 B2B가 함께 렌더링되고 새 이미지가 로드된다.

## 근거

`docs/changes/2026-10-04-hindsight-project-snapshot.md`, `docs/changes/2026-10-04-wishket-portfolio-content.md`, `docs/overview/current-development-context.md`, `docs/changes/2026-10-03-editorial-refresh-variety.md`를 사용한다. 기존 README 사실은 이번 작업에서 새 경력 주장으로 확대하지 않는다.
