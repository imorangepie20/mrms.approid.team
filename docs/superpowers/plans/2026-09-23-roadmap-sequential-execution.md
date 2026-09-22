# 로드맵 순차 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로드맵의 첫 미완료 게이트인 EMS 에디토리얼 섹션을 실제 데이터로 검증하고, 안전한 순서로 동기화·배포한다.

**Architecture:** 기존 TIDAL 공개 에디토리얼 discovery와 `ems_tracks` 조인 결과를 먼저 dry-run으로 산출한다. 최소 데이터 기준을 만족할 때만 section membership을 쓰고 Web release를 전환한다. 기준 미달이면 production write/deploy를 멈추고 bounded resolver 확장으로 되돌아간다.

**Tech Stack:** Python 3.12, `ems-pipeline`, PostgreSQL 16/pgvector, Docker Compose, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-ems-editorial-sections-design.md`, `docs/superpowers/plans/2026-09-22-home-ems-editorial-sections.md`

## Global Constraints

- 최소 4개 section이 각각 6곡 이상 joined 될 때만 실제 section sync를 수행한다.
- TIDAL token, secret, raw query/응답은 출력·저장하지 않는다.
- `ems_tracks` 원본과 사용자 데이터는 삭제·변경하지 않는다.
- 상시 EMS worker/resolver를 시작하지 않고 one-off bounded command만 사용한다.
- 사용자 소유 파일 `docs/plans/portable-self-hosted-deployment-guide.md`와 기존 테스트 변경을 건드리지 않는다.

## Review Focus

- 최신 unavailable availability가 이전 playable 이벤트를 가리면 section에서 제외되는가.
- 같은 트랙이 여러 section에 나타나지 않고 우선순위가 보존되는가.
- dry-run 실패 시 production DB와 Web release가 그대로 보존되는가.
- timeout 후보가 무한 재시도되지 않고 `paused/tidal_timeout`으로 남는가.
- 동기화 후 `(section_id, track_id)` 중복이 없는가.

---

### Task 1: 로컬 회귀 검증

**Files:**
- Read/verify: `services/ems-pipeline/tests`, `apps/web/src/lib/ems`, `apps/web/src/components/ems`
- Modify: 없음

- [x] **Step 1: 파이프라인 테스트 실행**

Run: `services/ems-pipeline/.venv/Scripts/python.exe -m pytest -q services/ems-pipeline/tests`

Expected: 모든 테스트 PASS.

- [x] **Step 2: Web 관련 테스트 실행**

Run: `npm --prefix apps/web test -- src/lib/ems src/components/ems src/components/dashboard/music-dashboard.test.tsx`

Expected: 모든 대상 테스트 PASS.

### Task 2: Zorin editorial dry-run

**Files:**
- Read/verify: `docs/runbooks/ems-catalog-ingestion.md`
- Modify: 없음

- [x] **Step 1: readiness와 section schema 상태 확인**

Run: `ssh approid@192.168.219.174 "curl -fsS http://127.0.0.1:3104/api/health/ready"`

Expected: HTTP 200. 실패하면 이후 명령을 중단한다.

- [x] **Step 2: one-off dry-run 실행**

Run: `ssh approid@192.168.219.174 "docker run --rm --network container:music-pie-web-1 --env-file /home/approid/apps/music-pie/shared/secrets/ems.env music-pie-ems-pipeline:current python -m ems_pipeline.cli sync-editorial-sections --dry-run"`

Expected: section별 `discovered`, `joined`, `stored` JSON만 출력한다. `stored`는 0이어야 한다.

- [x] **Step 3: 데이터 게이트 판정**

판정식: `joined >= 6`인 section이 4개 이상이면 Task 3으로 진행한다. 2026-09-23 결과는 `new-releases 8`, `seasonal-jazz 12`, `night-rnb 16`, `feel-good 17`로 통과했고 `focus`는 0이었다.

### Task 3: 조건부 section sync와 검증

**Files:**
- Modify: Zorin PostgreSQL section membership만 one-off sync로 갱신

- [x] **Step 1: dry-run과 동일 release로 실제 sync**

Run: `ssh approid@192.168.219.174 "docker run --rm --network container:music-pie-web-1 --env-file /home/approid/apps/music-pie/shared/secrets/ems.env music-pie-ems-pipeline:current python -m ems_pipeline.cli sync-editorial-sections"`

- [x] **Step 2: section별 수와 중복 확인**

DB 조회로 section별 membership 수와 `(section_id, track_id)` 중복 0건을 확인한다. 실패하면 Web release를 전환하지 않는다.

- [x] **Step 3: Web smoke**

`/api/health/ready`, `/api/ems/sections?region=KR&limit=12&sectionLimit=5`, `/`, `/ems`를 확인한다. 기존 Web rollback 기준을 보존한다.

### Task 4: 게이트 미달 시 bounded resolver 확장 (이번 실행에서는 생략)

**Files:**
- Modify: EMS run 상태와 후보 결과만 운영 DB에 기록

- [ ] **Step 1: paused 1,000곡 run의 남은 후보 수를 읽기 전용으로 확인**

`pending`/`retryable` 후보만 집계하고 active EMS 원본은 변경하지 않는다.

- [ ] **Step 2: 최대 25곡 one-off resolver 실행**

90초 timeout은 `paused/tidal_timeout`으로 기록하고 재시도 루프·상시 worker를 만들지 않는다.

- [ ] **Step 3: completed embedding과 editorial dry-run을 다시 확인**

재검증 결과가 게이트를 통과할 때까지 Task 2로 돌아가고, 통과하지 않으면 현재 release를 유지한다. 이번 실행은 Task 2에서 게이트를 통과해 이 Task를 실행하지 않았다.

### Task 5: 문서화

**Files:**
- Modify: `docs/overview/current-development-context.md`
- Modify: `docs/changes/2026-09-22-ems-editorial-sections.md`

- [x] **Step 1: 실제 명령·수치·미검증 항목 기록**

성공한 명령만 통과로 기록하고, dry-run 게이트 미달·timeout·배포 보류 여부를 명시한다.

- [x] **Step 2: diff 검증**

Run: `git diff --check`

Expected: 출력 없이 종료 코드 0.
