# GitHub 프로필 Music Pie 추가

## 변경과 게시 결과

2026-10-04 사용자 지정 `https://github.com/imorangepie20` 프로필에 Music Pie를 추가했다. 프로필 전용 저장소 `imorangepie20/imorangepie20`를 별도 checkout에서 수정했으며 Music Pie 저장소의 앱 코드·배포는 변경하지 않았다.

- 프로필 저장소: https://github.com/imorangepie20/imorangepie20
- 기존 기준 커밋: `fd5bebb4a79bc3568e725882eb5b65edbea63d3f`.
- 추가 커밋: `c72649a` (`docs: add Music Pie to developer profile`).
- 최종 커밋: `f68f0e0c75bd00f541043cf80bae07605b3aa5de` (`docs: fix music space emphasis rendering`).
- README와 새 `assets/music-pie-gms.png` 두 파일만 원격 main에 반영했다. checkout: `C:/Users/jowoo/AppData/Local/Temp/music-pie-github-profile-20261004`.

상단 서비스/저장소 링크, 소개와 경력 요약의 음악 분석 경험, 새 대표 프로젝트, 사용자 기능 4개 묶음, 문제·구현·근거 표 6행, 수집·관리·분석·운영 4개 묶음, 실제 기술 스택과 날짜가 있는 검증 결과·제한을 추가했다. TIDAL 연결·가져오기·FULL 재생·EMS/GMS/MMS·추천 액션·영구 제외·노출 중복 방지·선택 삭제·커스텀 알림·30초 오디오·조건부 하이브리드·멜론 5곡/8장르·관리자 네 그룹·홈/EMS 선곡 갱신을 포함했다.

기존 B2B-STM 본문과 근거 표, 경력·일하는 방식의 기존 항목, 기술 표의 기존 행, 연락처와 두 이미지를 보존했다. 공개 URL 수집의 실제 성공 범위, 확장 설계와 구현 완료, 제한 하이브리드와 전체 적용을 구분했다. 기존 포트폴리오용 실제 GMS 화면을 사용했고 연락처·계정 인증 정보가 없는 이미지를 확인했다.

## 검증

- P1 PASS: README의 Music Pie 근거 파일 9개를 현재 문서·코드와 대조했다. `current-development-context.md:5–11`, `editorial-refresh-variety.md:24–33`, `taste-analysis-system.md`, 위시켓 등록 원고와 사용자 확인이 기능·스택·배포/검증 날짜·참여 정보의 근거다.
- P2 PASS: 이전 커밋과 B2B 전체 섹션·연락처·기존 bullet/table 행을 문자열 비교하고, 기존 두 이미지의 Git blob이 일치함을 확인했다. 변경 파일은 README와 새 이미지 두 개, `git diff --check fd5bebb HEAD` exit 0.
- P3 PASS: 서비스·프로젝트 저장소·위시켓 및 근거 문서 원문 12개 URL HTTP 200. `git ls-remote origin refs/heads/main`은 최종 `f68f0e0…`와 일치했다. 해당 커밋의 raw README·새 이미지가 local Git blob과 byte 단위로 일치했다.
- P4 PASS: 비로그인 공개 프로필에서 Music Pie와 B2B-STM 두 대표 프로젝트, 기존 표지·새 Music Pie·기존 B2B 이미지 세 장의 로딩을 확인했다. EMS/GMS/MMS 강조는 실제 strong 요소로 표시됐다. 아래 증거의 `public-render.json`과 `music-pie-profile.png`를 저장했다.
- 필수 미검증: 없음.

## 검증 중 보정과 증거

기존 SVG의 Windows checkout 줄바꿈과 Git blob 비교 차이를 발견해 저장소의 정규화 blob 기준으로 비교했다. 첫 공개 렌더링에서는 괄호로 끝나는 굵은 표시와 한글 조사가 만나 Markdown 기호가 그대로 표시돼 약어만 강조하도록 원인을 수정했다. 최종 전체 P1~P4를 다시 확인했다. 검증 JSON 읽기의 Windows 기본 cp949 문제는 UTF-8 명시로 수정해 전체 검증을 재실행했다. 추가 제품 기능 테스트나 운영 데이터 변경은 이 프로필 게시 범위 밖이다.

증거: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/github-profile/verification.json`, `public-render.json`, `music-pie-profile.png`.

후속: 프로젝트 기능과 공개 근거가 바뀌면 README의 날짜·조건·근거 링크도 갱신한다. 계정 bio·고정 저장소·보안 설정은 이번 README 게시 작업에서 변경하지 않았다.
