# 같은 곡을 다시 선정하는 관리자 갱신 수정

## 원인과 결과

- 사용자가 갱신 후 같은 곡이 선정된다고 보고했다. 운영 미리보기 `f187acb3-ccf7-488b-b05b-b9ddef3a81ab`는 5개 섹션 모두 추가/제외 0이었다. 기존 구현은 원본 후보가 같으면 같은 상위 12곡을 다시 선택했다.
- 기능 커밋 `3cd1ea35b0da74eef733b513d344fc3f48da9689`를 origin/main에 push하고 Web·EMS에 배포했다. 추가 migration은 없다.
- 관리자 갱신은 현재 5개 공통 섹션에 없는 EMS track ID를 우선한다. TIDAL ID/ISRC 연결 후 현재 노출 여부를 판단하므로 다른 provider ID가 같은 EMS 트랙으로 연결돼도 새 곡으로 오인하지 않는다.
- 현재 노출 여부로 나눈 두 그룹 안에서는 기존 원본 순위를 유지한다. 다른 후보가 부족하면 기존 곡을 채운다. 섹션 간 중복 제거, 활성/30초/최신 KR STREAM 조건, 원본 provenance와 적용 transaction을 유지한다. 기존 CLI 순위 기반 갱신은 변경하지 않았다.
- 미리보기 화면 순위를 0부터 다시 부여해 다른 곡이 먼저 표시되며, 관리자에는 이 기준과 전체 추가/제외 수, 0곡 변경 안내를 표시한다.
- 영구 노출 이력을 추가한 기능은 아니다. 과거에 등장했던 곡이 다음 갱신에서 다시 선정될 수 있고 다른 후보가 없으면 기존 곡이 남는다.

## 실제 운영 적용

운영 관리자 버튼으로 미리보기 `48035e54-362f-4e7c-8f13-cb7ab96545c2`를 생성했다. 커스텀 확인창을 Escape로 취소한 뒤 같은 미리보기를 다시 열고 `선곡 적용`을 눌러 2026-10-03 **15:12:21 KST**에 적용했다. 기존 ready 미리보기는 새 요청에 의해 만료됐다.

| 섹션 | 이전/이후 | 교체 곡 수 | 변경 후 첫 곡 |
| --- | --- | --- | --- |
| 신곡 | 12 / 12 | 12 | Patient Zero |
| 재즈 | 12 / 12 | 12 | Look To The Sky |
| R&B | 12 / 12 | 5 | Too Deep |
| 팝·댄스 | 12 / 12 | 11 | PASSENGER |
| 집중 | 12 / 12 | 12 | Emerald Grove |

- 홈 3개 섹션 36곡 중 새 노출 **29곡**, EMS 5개 섹션 60곡 중 새 노출 **52곡**. R&B는 다른 적격 후보 5곡을 우선하고 기존 7곡을 유지했다.
- 공개 API ID/순서와 저장된 미리보기가 정확히 일치한다. 실제 Chrome 홈 36개·EMS 60개 카드 제목과 순서도 공개 API와 정확히 일치했다.
- 미리보기와 취소는 membership 쓰기 0. 개인 데이터 18개 테이블 fingerprint·화면별 설정·비대상 membership·기존 섹션 metadata(updated_at 제외)를 보존했다. source-routines ID/이미지/시작 시각도 유지했다.
- 같은 Melon 작업은 running을 유지하며 발견 450→455·후보 390→395, heartbeat 진전을 확인했다.

## 검증 기준 결과

- **C1 PASS**: 수정 전 회귀 재현에서 현재 상위 곡을 재선정하는 실패 3건을 확인했다(exit 1, 예상한 red 재현). 수정 후 `python -m pytest services/ems-pipeline/tests/test_editorial_refresh.py services/ems-pipeline/tests/test_editorial_sections.py -q` → exit 0, 22 passed. 동일 후보의 미노출 우선, 부족 시 채움, 모두 기존 후보, ISRC alias·다른 섹션 현재곡 회피·전역 중복 제거와 CLI 기존 순위 보존을 확인했다.
- **C2 PASS**: Python 전체 116 passed, 관련 Web 7파일·41개, Admin 5파일·13개 테스트 통과. 두 앱 lint 오류 0(기존 경고 Web 8/Admin 38), 타입/production build 및 diff check 통과. Admin build는 temp에 출력했다. 격리 `editorial_refresh_check` DB에서 001~033 up/down/reapply, 실제 Python 미리보기(신규 8곡 우선+기존 4곡, KR false/US-only/짧은 곡 제외, 순위 0~11, 쓰기 0)와 TypeScript 적용의 11개 assertion 묶음을 통과했다. 운영 UI에서 새 기준 문구·0곡 변경 안내·전체 52곡 변경, 390×844 표시와 커스텀 확인 Escape/트리거 포커스 복귀를 확인했다.
- **C3 PASS**: 이미지 revision `3cd1ea3`, local/public readiness·홈·EMS HTTP 200, 비로그인 관리자 API GET/POST 401, backup list/SHA 확인. 실제 관리자 미리보기→취소→적용→성공 표시와 공개 ID/순서/브라우저 카드 일치를 확인했다. 기존 대비 홈 29곡·EMS 52곡 변경, 사용자/설정/비대상/source-routines 보존, Web·EMS healthy/restart 0·Melon heartbeat 진전을 확인했다.

## 운영 증거와 복구

- Artifact: `/home/approid/apps/music-pie/shared/artifacts/20261003-editorial-variety/`. `postgres-verification.txt`, `deployment.txt`, `verification.txt`, `first-http-verification.txt`, `before-deploy.json`, `after-deploy.json`, `after-preview.json`, `after-apply.json`, `applied.json`, `home-api.json`, `ems-api.json`, `worker-before-apply.json`, `worker-after-apply.json`, `services-before.txt`, `services-after.txt`, `backup.sha256`에 증거를 보관했다.
- Release: `/home/approid/apps/music-pie/releases/20261003-editorial-variety-3cd1ea3`.
- Web: `sha256:6ee134dffcdefb93972ae65627cd7b53cb726618129a04bbc5f17c12c353a95f`.
- EMS: `sha256:ebb9bce815624e17232feef9673880ed5de93cbd62bd2a6f616072c77120816e`.
- Backup: `shared/backups/music-pie-pre-editorial-variety-3cd1ea3.dump`; SHA-256 `d125299e13995bac573fe993ef26cbedb0fa18556f8e6af266e517778d9641d3`. 직전 release 및 `music-pie-web:pre-variety-20261003`, `music-pie-ems-pipeline:pre-variety-20261003`을 유지한다. 선곡 복구가 필요하면 job backup과 대상 membership만 검토하고 전체 DB를 임의 복원하지 않는다.
- 브라우저 증거: `C:/Users/jowoo/.codex/visualizations/2026/10/02/01a0ff07-63cb-7892-9617-909f8e712bc3/editorial-variety/`의 `unchanged-message.png`, `mobile-policy.png`, `ready-52.png`, `production-applied.png`, `home-updated.png`, `ems-updated.png`, `public-dom-verification.json`.

## 재검증과 미검증

- 첫 운영 HTTP 검사에서 공개 API 520이 한 번 발생했다(C3 최초 비통과 1개). 내부 Home/EMS는 200(0.24/0.22초), 공개 Home/EMS는 200(2.00/2.16초), Web·EMS healthy/restart 0을 확인했고, 전체 운영 검증을 재실행해 모두 통과했다. 제품 파일은 이 재검증 중 변경하지 않았다. 최초 실패 증거를 별도 파일에 보존했다.
- 일회성 520의 정확한 원인은 확정하지 못했다. 필수 C1~C3 기준은 모두 PASS이며 실제 휴대전화·오디오 스트리밍·backup 복원 실행은 이번 범위 밖이다.
- 원본 후보 자체가 적으면 교체할 수 있는 곡 수가 제한된다. 원본 확대·영구 노출 이력·관리자 수동 기준 편집은 별도 범위로 남긴다.
