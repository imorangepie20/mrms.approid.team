# GMS Personalized Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fixture-based GMS cards with user-scoped EMS recommendations that follow the approved `ems-v1` scoring and exclusion rules.

**Architecture:** The Web repository loads the latest completed taste profile and ranks active, KR-streamable EMS embeddings with the documented global/cluster similarity contract. A protected recommendations API returns playable EMS tracks, while a protected decision API records per-user accept/reject/skip actions. The GMS page receives server-ranked tracks and keeps existing session actions for immediate UI feedback.

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL/pgvector, Vitest, existing Auth0 session helper and MusicSessionProvider.

**Spec:** `docs/superpowers/specs/2026-09-22-ems-catalog-ingestion-design.md` and `docs/superpowers/specs/2026-09-22-track-embedding-taste-profile-design.md`

## Global Constraints

- GMS uses active EMS tracks with latest KR `STREAM` availability and completed EMS embeddings only.
- Exclude tracks already present in the user’s selected TIDAL playlists, previously accepted tracks, and permanently rejected tracks.
- Use profile similarity `0.3 × global centroid + 0.7 × best accepted cluster`; use fixed `ems-v1` score weights of 65/15/10/10.
- Keep user data and decisions isolated by Auth0 subject; never mutate the shared EMS catalog for a user decision.
- Do not add popularity to the taste profile or introduce automatic behavior-weight learning.
- Preserve the untracked user document `docs/plans/portable-self-hosted-deployment-guide.md`.

## Review Focus

- Missing or building taste profile returns a safe empty recommendation result rather than fixtures.
- A selected playlist track is excluded by TIDAL ID even though user-library and EMS UUIDs differ.
- A permanent rejection from one user does not affect another user or the EMS catalog.
- Latest unavailable availability event hides a track even if an older event was playable.
- Candidate ties are deterministic and diversity prevents one artist from filling the first page.

---

### Task 1: Implement the EMS recommendation repository

**Files:**
- Create: `apps/web/src/lib/db/gms-recommendations.ts`
- Test: `apps/web/src/lib/db/gms-recommendations.test.ts`

**Interfaces:**
- Consumes: `auth0Subject`, completed `user_taste_profiles`/`user_taste_centroids`, `ems_tracks`, `ems_track_embeddings`, availability events, and user library/decision tables.
- Produces: `{ profileReady, profileVersion, tracks }` with `Track` fields plus score metadata; a subject-scoped decision writer.

- [x] Write failing repository tests for profile gating, exclusion SQL, deterministic score mapping, and decision ownership.
- [x] Run the focused Vitest file and observe failures caused by the missing repository.
- [x] Implement the two-query repository: load the latest completed profile, then fetch candidate rows and greedily apply the approved score/diversity weights.
- [x] Implement subject-scoped decision insertion with `INSERT ... SELECT` and reject missing users.
- [x] Run the focused tests until green.

### Task 2: Add protected recommendation and decision APIs

**Files:**
- Create: `apps/web/src/app/api/recommendations/route.ts`
- Create: `apps/web/src/app/api/recommendations/decisions/route.ts`
- Test: `apps/web/src/app/api/recommendations/route.test.ts`
- Test: `apps/web/src/app/api/recommendations/decisions/route.test.ts`

**Interfaces:**
- Consumes: Auth0 subject and repository functions from Task 1.
- Produces: authenticated `GET /api/recommendations?limit=12` and authenticated `POST /api/recommendations/decisions`.

- [x] Add failing tests for anonymous 401, profile-not-ready response, bounded limit, valid decisions, and invalid body rejection.
- [x] Run focused route tests and verify expected red failures.
- [x] Implement auth, input validation, error mapping, and JSON responses without exposing embeddings or user identifiers.
- [x] Run focused route tests until green.

### Task 3: Connect GMS to real recommendations

**Files:**
- Modify: `apps/web/src/app/gms/page.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.tsx`
- Modify: `apps/web/src/providers/music-session-provider.tsx`
- Modify: `apps/web/src/components/dashboard/music-dashboard.test.tsx`
- Modify: `apps/web/src/providers/music-session-provider.test.tsx`

**Interfaces:**
- Consumes: Task 2 recommendation response and decision endpoint.
- Produces: GMS cards backed by EMS track IDs/artwork, profile-not-ready state, and persisted accept/reject actions.

- [x] Add failing UI/provider tests proving GMS no longer renders fixture tracks and decisions call the protected API.
- [x] Run the focused UI/provider tests and observe the expected failures.
- [x] Load recommendations in the server page, pass them through the dashboard, and make session accept/reject fire-and-forget decision writes while preserving immediate state updates.
- [x] Run focused UI/provider tests until green.

### Task 4: Verify and document

**Files:**
- Modify: `docs/changes/2026-09-22-gms-personalized-recommendations.md`
- Modify: `docs/overview/current-development-context.md`

- [x] Run Web full tests, lint, build, and `git diff --check`.
- [x] Record only successful commands, known warnings, and unverified production browser checks.
- [x] Review the diff for user isolation, rejection permanence, and fixture leakage.

실제 completed taste profile을 가진 로그인 계정의 공개 GMS 카드·결정 저장 브라우저 검증은 아직 남아 있다. 현재 운영 DB의 completed profile은 0건이다.

