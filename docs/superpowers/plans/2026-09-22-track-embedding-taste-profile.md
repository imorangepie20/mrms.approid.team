# 트랙 임베딩과 최초 취향 프로필 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TIDAL 저장 트랙을 로컬 multilingual MPNet으로 임베딩하고, 사용자별 단일 또는 최대 3개의 최초 취향 중심을 PostgreSQL에 안전하게 저장한다.

**Architecture:** 내부 FastAPI 컨테이너가 고정 모델 revision으로 768차원 정규화 벡터만 생성한다. Next.js는 인증된 사용자 범위에서 작업을 claim하고 pgvector에 저장한 뒤 결정론적 취향 프로필을 계산한다. 브라우저 온보딩은 기존 MusicBrainz 보강 다음에 분석 API를 반복 호출한다.

**Tech Stack:** Python 3.12, FastAPI 0.141.1, sentence-transformers 6.1.0, PyTorch CPU, Next.js 16, TypeScript, PostgreSQL 16, pgvector 0.8.6, Vitest, pytest, Docker Compose

**Spec:** `docs/superpowers/specs/2026-09-22-track-embedding-taste-profile-design.md`

## Global Constraints

- 모델은 `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` revision `088a2c0bb2f721158b8350700bf0f2a250df25ae`로 고정한다.
- 출력은 유한한 L2 정규화 `float32[768]`만 허용한다.
- 모델 서비스는 외부 포트를 열지 않고 사용자 ID·토큰·TIDAL 자격 증명·입력 텍스트를 로그에 남기지 않는다.
- 고유 트랙 15곡 미만은 프로필을 만들지 않고, 60곡 미만은 단일 중심만 만든다.
- 사용자의 트랙·작업·취향 중심은 Auth0 subject에서 확인한 사용자 FK 범위 밖으로 섞지 않는다.
- 기존 DB·volume을 바꾸기 전 dump를 만들고 PostgreSQL 16 rollback image를 보존한다.
- EMS 후보와 실제 GMS 교체는 이번 계획에 포함하지 않는다.

## Review Focus

- 빈 문자열·17개 이상 batch·768차원이 아닌 모델 응답은 저장하지 않고 명시적 오류를 반환해야 한다. Task 1·3에서 고정한다.
- 모델 timeout이나 부분 batch 실패 시 claim한 작업 전체가 재시도 가능 상태가 되어야 한다. Task 4에서 고정한다.
- 같은 TIDAL 트랙이 여러 플레이리스트에 있어도 벡터는 한 개이고 playlist 가중치만 증가해야 한다. Task 2·5에서 고정한다.
- 한 사용자의 분석 요청이 다른 사용자의 작업이나 중심을 읽거나 갱신하면 안 된다. Task 2·4·5에서 고정한다.
- 분석 중 브라우저 이동·새로고침이 발생해도 완료 벡터를 재생성하지 않고 다음 호출에서 남은 작업부터 이어야 한다. Task 4·6에서 고정한다.

---

### Task 1: 내부 임베딩 서비스

**Files:**
- Create: `services/embedding/app/__init__.py`
- Create: `services/embedding/app/model.py`
- Create: `services/embedding/app/main.py`
- Create: `services/embedding/tests/test_main.py`
- Create: `services/embedding/requirements.txt`
- Create: `services/embedding/Dockerfile`
- Modify: `.gitignore`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: `POST /v1/embeddings` JSON `{ "texts": string[] }`
- Produces: `{ "modelId": string, "modelRevision": string, "dimensions": 768, "embeddings": number[][] }`

- [ ] **Step 1: Create an isolated Python environment**

Add `.venv/` to `.gitignore` and `.dockerignore`, then run:

```bash
python -m venv services/embedding/.venv
services/embedding/.venv/Scripts/python -m pip install fastapi==0.141.1 httpx==0.28.1 pytest==9.0.2
```

- [ ] **Step 2: Write failing FastAPI contract tests**

```python
def test_embeds_a_batch_without_logging_input(client, caplog):
    response = client.post("/v1/embeddings", json={"texts": ["Blue | Joni Mitchell | Blue | folk"]})
    assert response.status_code == 200
    body = response.json()
    assert body["dimensions"] == 768
    assert len(body["embeddings"][0]) == 768
    assert "Joni Mitchell" not in caplog.text

def test_rejects_empty_or_oversized_batches(client):
    assert client.post("/v1/embeddings", json={"texts": []}).status_code == 422
    assert client.post("/v1/embeddings", json={"texts": ["x"] * 17}).status_code == 422
```

- [ ] **Step 3: Run tests and verify RED**

Run: `services/embedding/.venv/Scripts/python -m pytest services/embedding/tests/test_main.py -q`

Expected: FAIL because `services.embedding.app.main` does not exist.

- [ ] **Step 4: Implement dependency-injected model adapter and API**

```python
MODEL_ID = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
MODEL_REVISION = "088a2c0bb2f721158b8350700bf0f2a250df25ae"
DIMENSIONS = 768

class Embedder(Protocol):
    def encode(self, texts: list[str]) -> list[list[float]]: ...

class SentenceTransformerEmbedder:
    def __init__(self) -> None:
        self.model = SentenceTransformer(MODEL_ID, revision=MODEL_REVISION)

    def encode(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode(texts, batch_size=16, normalize_embeddings=True)
        return vectors.astype("float32").tolist()
```

`create_app(embedder)`는 test fake를 받고 production lifespan은 실제 모델을 한 번만 로드한다. API는 batch 크기 `1..16`, 공백이 아닌 문자열, 각 벡터 768차원·유한값을 검증한다.

- [ ] **Step 5: Pin dependencies and build offline model image**

`requirements.txt`:

```text
fastapi[standard]==0.141.1
sentence-transformers==6.1.0
pytest==9.0.2
httpx==0.28.1
```

`Dockerfile`은 `python:3.12-slim-bookworm`에서 의존성을 설치하고 build 단계에서 다음을 실행한다.

```dockerfile
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-mpnet-base-v2', revision='088a2c0bb2f721158b8350700bf0f2a250df25ae')"
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
```

- [ ] **Step 6: Install full dependencies and verify service tests and container health**

Run:

```bash
services/embedding/.venv/Scripts/python -m pip install -r services/embedding/requirements.txt
services/embedding/.venv/Scripts/python -m pytest services/embedding/tests -q
docker build -t music-pie-embedding:test services/embedding
docker run --rm --name music-pie-embedding-test -d -p 127.0.0.1:38000:8000 music-pie-embedding:test
curl --fail http://127.0.0.1:38000/health/ready
docker stop music-pie-embedding-test
```

Expected: pytest PASS, readiness HTTP 200, container stops cleanly.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .dockerignore services/embedding
git commit -m "feat: add local embedding service"
```

### Task 2: pgvector schema and user-scoped job repository

**Files:**
- Create: `apps/web/src/lib/db/migrations/007_track_embeddings.sql`
- Create: `apps/web/src/lib/db/migrations/007_track_embeddings.down.sql`
- Create: `apps/web/src/lib/db/embeddings.ts`
- Create: `apps/web/src/lib/db/embeddings.test.ts`

**Interfaces:**
- Produces: `syncEmbeddingJobs(auth0Subject, model, vocabulary)`, `claimEmbeddingJobs(auth0Subject, limit)`, `completeEmbeddingJobs(...)`, `retryEmbeddingJobs(...)`, `countPendingEmbeddingJobs(auth0Subject)`
- Consumes: 기존 `buildEmbeddingText(track, vocabulary)`와 사용자별 저장 트랙

- [ ] **Step 1: Write migration**

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE track_embeddings (
  track_id UUID PRIMARY KEY REFERENCES music_tracks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  input_hash CHAR(64) NOT NULL,
  input_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  embedding vector(768),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (embedding IS NOT NULL))
);
CREATE TABLE user_taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('building', 'completed')),
  unique_track_count INTEGER NOT NULL CHECK (unique_track_count >= 15),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, model_id, model_revision, algorithm_version)
);
CREATE TABLE user_taste_centroids (
  profile_id UUID NOT NULL REFERENCES user_taste_profiles(id) ON DELETE CASCADE,
  cluster_index SMALLINT NOT NULL CHECK (cluster_index BETWEEN 0 AND 3),
  track_count INTEGER NOT NULL CHECK (track_count > 0),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 1),
  embedding vector(768) NOT NULL,
  PRIMARY KEY (profile_id, cluster_index)
);
COMMIT;
```

Down migration drops centroids, profiles, embeddings, then `DROP EXTENSION IF EXISTS vector` in one transaction.

- [ ] **Step 2: Execute migration against disposable pgvector PostgreSQL**

Run:

```bash
docker run --rm -d --name music-pie-pgvector-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=music_pie -p 127.0.0.1:55435:5432 pgvector/pgvector:0.8.6-pg16-bookworm
docker exec -i music-pie-pgvector-test psql -U postgres -d music_pie < apps/web/src/lib/db/migrations/001_user_tidal_connections.sql
docker exec -i music-pie-pgvector-test psql -U postgres -d music_pie < apps/web/src/lib/db/migrations/003_user_music_library.sql
docker exec -i music-pie-pgvector-test psql -U postgres -d music_pie < apps/web/src/lib/db/migrations/006_musicbrainz_genres.sql
docker exec -i music-pie-pgvector-test psql -U postgres -d music_pie < apps/web/src/lib/db/migrations/007_track_embeddings.sql
docker exec music-pie-pgvector-test psql -U postgres -d music_pie -tAc "SELECT extversion FROM pg_extension WHERE extname='vector'"
```

Expected: extension version `0.8.6`; all three new tables exist. Run down migration and verify the three tables are absent, then stop the container.

- [ ] **Step 3: Write failing repository tests**

Tests must prove:

```ts
it("creates one job per unique user track and hashes model revision plus input");
it("does not claim another user's jobs");
it("claims at most 16 jobs with FOR UPDATE SKIP LOCKED");
it("does not reset a completed job when its hash is unchanged");
it("resets a completed job when genres change the hash");
```

Use literal SHA-256 expectations computed once outside production helpers.

- [ ] **Step 4: Run repository tests and verify RED**

Run: `cd apps/web && npx vitest run src/lib/db/embeddings.test.ts`

Expected: FAIL because `embeddings.ts` does not exist.

- [ ] **Step 5: Implement minimal SQL repository**

```ts
export type ClaimedEmbeddingJob = {
  attemptCount: number;
  inputHash: string;
  inputText: string;
  trackId: string;
};

export async function claimEmbeddingJobs(
  auth0Subject: string,
  limit = 16,
  executor?: TransactionExecutor,
): Promise<ClaimedEmbeddingJob[]>;
```

Claim query joins `music_tracks`와 `app_users`, filters `auth0_subject = $1`, orders by `updated_at, track_id`, and uses `FOR UPDATE OF e SKIP LOCKED`. `syncEmbeddingJobs` obtains playlist membership counts and calls `buildEmbeddingText`; `input_hash` uses `createHash("sha256")` over `${modelRevision}\0${inputText}`.

- [ ] **Step 6: Run tests and commit**

```bash
cd apps/web && npx vitest run src/lib/db/embeddings.test.ts src/lib/db/music-library.test.ts
git add apps/web/src/lib/db/migrations/007_track_embeddings* apps/web/src/lib/db/embeddings*
git commit -m "feat: store versioned track embeddings"
```

### Task 3: Next.js embedding service client

**Files:**
- Create: `apps/web/src/lib/embeddings/client.ts`
- Create: `apps/web/src/lib/embeddings/client.test.ts`

**Interfaces:**
- Produces: `embedTexts(texts: string[], fetcher?: typeof fetch): Promise<EmbeddingBatch>`
- Consumes: `EMBEDDING_SERVICE_URL`, default `http://embedding:8000`, and the Task 1 response contract

- [ ] **Step 1: Write failing client boundary tests**

```ts
it("posts no more than 16 texts and accepts normalized 768-dimensional vectors");
it("rejects a model revision mismatch");
it("rejects NaN, Infinity, or the wrong vector length");
it("aborts the request after 30 seconds");
```

Use complete fake HTTP responses with literal `dimensions`, `modelId`, `modelRevision`, and 768-number arrays.

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/web && npx vitest run src/lib/embeddings/client.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict client**

```ts
export type EmbeddingBatch = {
  embeddings: number[][];
  modelId: string;
  modelRevision: string;
};

export async function embedTexts(
  texts: string[],
  fetcher: typeof fetch = fetch,
): Promise<EmbeddingBatch>;
```

Use `AbortSignal.timeout(30_000)`. Validate batch length, exact configured model identity, vector length, finite numbers, and norm in `0.999..1.001`. Throw stable codes: `embedding_batch_invalid`, `embedding_service_unavailable`, `embedding_response_invalid`, `embedding_model_mismatch`.

- [ ] **Step 4: Run and commit**

```bash
cd apps/web && npx vitest run src/lib/embeddings/client.test.ts
git add apps/web/src/lib/embeddings
git commit -m "feat: call internal embedding service"
```

### Task 4: Resumable embedding analysis API

**Files:**
- Create: `apps/web/src/lib/embeddings/jobs.ts`
- Create: `apps/web/src/lib/embeddings/jobs.test.ts`
- Create: `apps/web/src/app/api/recommendations/analyze/route.ts`
- Create: `apps/web/src/app/api/recommendations/analyze/route.test.ts`

**Interfaces:**
- Produces: `processEmbeddingBatch(auth0Subject, dependencies?)` and authenticated `POST /api/recommendations/analyze`
- Consumes: Task 2 repository and Task 3 `embedTexts`

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("syncs jobs, embeds one batch, and stores vectors against matching track ids");
it("returns remaining work without calling the model when no jobs are claimable");
it("returns every claimed job to retryable state when the batch request times out");
it("never completes a job when response count differs from claim count");
```

The timeout case asserts repository state behavior, not mock existence: the fake repository records job statuses and the assertion reads those statuses.

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/web && npx vitest run src/lib/embeddings/jobs.test.ts`

Expected: FAIL because `jobs.ts` does not exist.

- [ ] **Step 3: Implement one-batch orchestration**

```ts
export type AnalysisProgress = {
  embeddedTrackCount: number;
  failedTrackCount: number;
  profileReady: boolean;
  remaining: number;
};

export async function processEmbeddingBatch(
  auth0Subject: string,
  dependencies: EmbeddingJobDependencies = productionDependencies,
): Promise<AnalysisProgress>;
```

Call order is `sync -> claim(16) -> embed -> complete/retry -> count`. Repeated calls reuse completed hashes. Route authenticates with `requireAuth0Subject`; unauthorized returns 401, model unavailable returns 503, malformed model output returns 502.

- [ ] **Step 4: Write route tests, run, and commit**

```bash
cd apps/web && npx vitest run src/lib/embeddings/jobs.test.ts src/app/api/recommendations/analyze/route.test.ts
git add apps/web/src/lib/embeddings apps/web/src/app/api/recommendations/analyze
git commit -m "feat: process resumable embedding jobs"
```

### Task 5: Deterministic user taste profiles

**Files:**
- Create: `apps/web/src/lib/recommendations/taste-profile.ts`
- Create: `apps/web/src/lib/recommendations/taste-profile.test.ts`
- Create: `apps/web/src/lib/db/taste-profiles.ts`
- Create: `apps/web/src/lib/db/taste-profiles.test.ts`
- Modify: `apps/web/src/lib/embeddings/jobs.ts`
- Modify: `apps/web/src/lib/embeddings/jobs.test.ts`

**Interfaces:**
- Produces: `buildTasteProfile(inputs, seed): TasteProfileResult`, `replaceTasteProfile(auth0Subject, result, metadata)`
- Consumes: completed normalized vectors plus `artist`, `playlistCount`, `trackId`

- [ ] **Step 1: Write failing pure algorithm tests**

```ts
it("rejects 14 unique tracks");
it("returns one normalized centroid for 15 through 59 tracks");
it("counts one vector once while increasing its capped playlist weight");
it("reduces but does not erase a repeated artist's total influence");
it("returns the same clusters and order for the fixed seed");
it("accepts two or three clusters only when every cluster has 10 tracks and silhouette is at least 0.10");
it("falls back to one centroid for 60 near-identical vectors");
```

Use hand-constructed unit vectors with literal expected centroids and cluster sizes. Do not call the embedding model in these tests.

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/web && npx vitest run src/lib/recommendations/taste-profile.test.ts`

Expected: FAIL because `taste-profile.ts` does not exist.

- [ ] **Step 3: Implement vector math and seeded spherical k-means**

```ts
export type TasteProfileInput = {
  artist: string;
  embedding: number[];
  playlistCount: number;
  trackId: string;
};

export type TasteCentroid = {
  clusterIndex: 0 | 1 | 2 | 3;
  embedding: number[];
  trackCount: number;
  weight: number;
};

export function buildTasteProfile(
  inputs: TasteProfileInput[],
  seed = 20260922,
): { centroids: TasteCentroid[]; uniqueTrackCount: number };
```

Keep `normalize`, `dot`, weighted mean, seeded PRNG, assignment, centroid update, and cosine silhouette as private functions. Stop after 50 iterations or unchanged assignments. Sort cluster centroids by descending track count then first member `trackId` so persisted indices are stable.

- [ ] **Step 4: Write failing persistence tests**

Tests prove atomic replacement, Auth0 scoping, old completed profile remains readable until commit, and `cluster_index = 0` is always the global centroid.

- [ ] **Step 5: Implement persistence and connect profile completion**

`replaceTasteProfile` starts a transaction, upserts the profile as `building`, replaces all centroid rows, then marks it `completed`. Extend `processEmbeddingBatch`: when remaining is zero and failed count is zero, load completed user inputs, build the profile, replace it, and return `profileReady: true`.

- [ ] **Step 6: Run and commit**

```bash
cd apps/web && npx vitest run src/lib/recommendations/taste-profile.test.ts src/lib/db/taste-profiles.test.ts src/lib/embeddings/jobs.test.ts
git add apps/web/src/lib/recommendations apps/web/src/lib/db/taste-profiles* apps/web/src/lib/embeddings/jobs*
git commit -m "feat: build adaptive user taste profiles"
```

### Task 6: Onboarding analysis progress and retry

**Files:**
- Modify: `apps/web/src/lib/tidal/client-api.ts`
- Modify: `apps/web/src/components/onboarding/tidal-onboarding.tsx`
- Modify: `apps/web/src/components/onboarding/tidal-onboarding.test.tsx`

**Interfaces:**
- Produces: visible analysis status and retry path after playlist import
- Consumes: `POST /api/musicbrainz/enrich`, then repeated `POST /api/recommendations/analyze`

- [ ] **Step 1: Write failing UI tests**

```ts
it("runs embedding batches only after MusicBrainz enrichment reaches zero");
it("shows embedded and remaining counts while analysis runs");
it("shows recommendation ready only after profileReady is true");
it("keeps saved MMS and offers analysis retry after a 503 response");
it("resumes remaining jobs after retry without starting another playlist import");
```

- [ ] **Step 2: Run and verify RED**

Run: `cd apps/web && npx vitest run src/components/onboarding/tidal-onboarding.test.tsx`

Expected: new assertions FAIL while existing import tests remain green.

- [ ] **Step 3: Add client API and analysis state**

```ts
export async function processTasteAnalysis(signal?: AbortSignal) {
  const response = await fetch("/api/recommendations/analyze", {
    method: "POST",
    signal,
  });
  return responseJson<AnalysisProgress>(response, "taste_analysis_failed");
}
```

Add `analyzing` and `analysisFailed` UI states. After enrichment reaches zero, call analysis until `profileReady`, `remaining === 0` with failures, abort, or error. Wait 250ms between batches so the UI updates. A failure shows `MMS는 저장됐어요. 취향 분석을 다시 시도해 주세요.` and a `분석 다시 시도` button.

- [ ] **Step 4: Run UI and full web checks**

```bash
cd apps/web
npx vitest run src/components/onboarding/tidal-onboarding.test.tsx src/app/api/recommendations/analyze/route.test.ts
npm test
npm run lint
npm run build
```

Expected: all commands exit 0. Secret-free build may emit the documented Auth0 missing-config warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/tidal/client-api.ts apps/web/src/components/onboarding
git commit -m "feat: show taste analysis progress"
```

### Task 7: Compose integration, reversible Zorin deployment, and records

**Files:**
- Modify: `infra/compose.zorin.yml`
- Create: `apps/web/src/lib/deployment/compose-zorin.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Create: `docs/changes/2026-09-22-track-embedding-taste-profile.md`
- Modify: `docs/overview/current-development-context.md`

**Interfaces:**
- Produces: healthy private `embedding` service and pgvector-backed production-compatible test deployment
- Consumes: Task 1 image, Task 2 migration, Tasks 3–6 web code

- [ ] **Step 1: Add the YAML test parser**

Run: `cd apps/web && npm install --save-dev yaml@2.8.1`

- [ ] **Step 2: Write failing Compose structure test**

Create `apps/web/src/lib/deployment/compose-zorin.test.ts` and parse `../../../../infra/compose.zorin.yml` from that file with `yaml.parse`. Assert:

```ts
const composePath = resolve(process.cwd(), "../../infra/compose.zorin.yml");
const compose = parse(readFileSync(composePath, "utf8"));
expect(compose.services.embedding.ports).toBeUndefined();
expect(compose.services.embedding.networks).toEqual(["backend"]);
expect(compose.services.embedding.healthcheck).toBeDefined();
expect(compose.services.postgres.image).toContain("pgvector/pgvector:0.8.6-pg16-bookworm@");
```

- [ ] **Step 3: Run and verify RED**

Run: `cd apps/web && npx vitest run src/lib/deployment/compose-zorin.test.ts`

Expected: FAIL because the service and pgvector image are absent.

- [ ] **Step 4: Update Compose**

Add `embedding` image/build, healthcheck, `backend` network only, `restart: unless-stopped`, local log rotation, `mem_limit: 3g`, and `cpus: 4.0`. Add `EMBEDDING_SERVICE_URL=http://embedding:8000` to Web environment without storing secrets. Replace PostgreSQL image with a digest-pinned `pgvector/pgvector:0.8.6-pg16-bookworm` image. Web keeps its healthy PostgreSQL dependency but does not depend on embedding health; model failure must leave playback and MMS available while the analysis API returns 503.

- [ ] **Step 5: Verify local Compose and images**

```bash
docker compose -p music-pie-test -f infra/compose.zorin.yml config
docker compose -p music-pie-test -f infra/compose.zorin.yml build web embedding
docker image inspect music-pie-embedding --format '{{.Config.User}}'
```

Expected: config valid, both images build, embedding container runs as a non-root user.

- [ ] **Step 6: Prepare exact Zorin rollback**

On Zorin:

```bash
docker tag music-pie-web:current music-pie-web:rollback-dae510c
docker tag postgres:16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685 music-pie-postgres:rollback-16.15
docker exec music-pie-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /home/approid/apps/music-pie/shared/backup/pre-embedding.dump
chmod 600 /home/approid/apps/music-pie/shared/backup/pre-embedding.dump
```

Verify dump with `pg_restore --list` before changing the DB image.

Rollback order after any failed migration or service verification: keep pgvector PostgreSQL running, apply `007_track_embeddings.down.sql`, stop the stack, restore the pinned PostgreSQL 16.15 image in Compose, start PostgreSQL, and restore `pre-embedding.dump` only if row-count or schema preservation checks failed.

- [ ] **Step 7: Deploy migration and services**

Build from a new immutable release directory. Start the pgvector PostgreSQL image against the existing PG16 volume, wait for health, apply `007_track_embeddings.sql`, then start embedding and Web with project name `music-pie`. Do not change the tunnel origin.

- [ ] **Step 8: Verify real data and isolation**

Run on Zorin:

```sql
SELECT count(*) FROM music_tracks;                         -- 101
SELECT count(*) FROM track_embeddings WHERE status='completed'; -- 101 after authenticated analysis
SELECT min(vector_dims(embedding)), max(vector_dims(embedding)) FROM track_embeddings;
SELECT min(vector_norm(embedding)), max(vector_norm(embedding)) FROM track_embeddings;
SELECT count(*) FROM user_taste_profiles WHERE status='completed'; -- 1
SELECT cluster_index, track_count, weight FROM user_taste_centroids ORDER BY cluster_index;
```

Expected: original 101 tracks remain, every completed vector has 768 dimensions and norm in `0.999..1.001`, one completed user profile exists, centroid 0 exists, and no more than three cluster centroids exist.

Also verify public `/api/health/ready`, `/onboarding`, `/mms`, `/gms` return expected HTTP statuses; unauthenticated `POST /api/recommendations/analyze` returns 401; Web and embedding logs contain no input text or unhandled error.

- [ ] **Step 9: Record results and commit**

Document exact image digests, dump checksum, migration result, row counts, resource usage, verified and unverified browser flows. Update the latest feature and Zorin deployment commit fields.

```bash
git add infra apps/web/package.json apps/web/package-lock.json apps/web/src/lib/deployment/compose-zorin.test.ts docs/changes/2026-09-22-track-embedding-taste-profile.md docs/overview/current-development-context.md
git commit -m "build: deploy local taste embeddings"
```

### Task 8: Final regression and scope review

**Files:**
- Review only: all files changed since `2647574`

**Interfaces:**
- Consumes: Tasks 1–7
- Produces: verified handoff with no EMS/GMS scope leakage

- [ ] **Step 1: Run complete verification fresh**

```bash
services/embedding/.venv/Scripts/python -m pytest services/embedding/tests -q
cd apps/web && npm test && npm run lint && npm run build
cd ../.. && git diff --check 2647574..HEAD
```

- [ ] **Step 2: Inspect the complete diff**

Confirm every changed line supports model service, vector persistence, profile calculation, onboarding progress, deployment, or records. Confirm no fixture EMS result is presented as an actual personalized recommendation.

- [ ] **Step 3: Verify worktree and server state**

`git status --short --branch` must show only known user-owned files. Zorin Compose must show PostgreSQL, embedding, Web, and tunnel healthy/running. Preserve Windows PostgreSQL rollback data and the Zorin pre-embedding dump.

- [ ] **Step 4: Commit only if review required a correction**

```bash
git add -p
git commit -m "fix: close taste profile verification gaps"
```
