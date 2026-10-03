export type EmsSummary = {
  activeTrackCount: number;
  activeSectionCount: number;
  artworkMissingCount: number;
  embeddingCounts: Record<string, number>;
  latestIngest: EmsIngestRun | null;
};

export type AudioAnalysisStatus = "missing" | "pending" | "running" | "completed" | "retryable" | "failed";

export type AudioAnalysisTrack = {
  id: string;
  tidalTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  status: AudioAnalysisStatus;
  featureVersion: string | null;
  previewHash: string | null;
  durationSeconds: number | null;
  dimensions: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  completedAt: string | null;
  updatedAt: string | null;
};

export type AudioAnalysisAdminData = {
  coverage: { activeTrackCount: number; stagedTrackCount: number; completedTrackCount: number; stagedRatio: number; completedRatio: number };
  statusCounts: Record<AudioAnalysisStatus, number>;
  featureVersions: Array<{ featureVersion: string; completedTrackCount: number }>;
  embeddingModelVersions: Array<{ modelId: string; modelRevision: string; dimensions: number; completedTrackCount: number }>;
  predictionModelVersions: Array<{ modelId: string; modelRevision: string; vocabularyVersion: string; completedTrackCount: number }>;
  errorCodes: Array<{ status: "retryable" | "failed"; code: string; count: number }>;
  throughput: { completedLast24Hours: number; days: Array<{ date: string; completedCount: number }> };
  benchmarks: Array<{ environment: string; input: string; coldLatencySeconds: number; warmLatencySeconds: number; peakRssGib: number; source: string }>;
  tracks: { totalCount: number; page: number; limit: number; nextPage: number | null; items: AudioAnalysisTrack[] };
};

export type AudioAnalysisTrackDetail = AudioAnalysisTrack & {
  job: { claimedAt: string | null; leaseExpiresAt: string | null; nextAttemptAt: string | null; lastErrorAt: string | null } | null;
  feature: {
    previewHash: string; featureVersion: string; durationSeconds: number; sampleRate: number; channelCount: number;
    segmentCount: number; coverageRatio: number; whole: unknown; segments: unknown; summary: unknown; dsp: unknown; createdAt: string;
  } | null;
  embeddings: Array<{ modelId: string; modelRevision: string; previewHash: string; dimensions: number; normalization: string; createdAt: string }>;
  predictions: Array<{ modelId: string; modelRevision: string; vocabularyVersion: string; label: string; probability: number }>;
};

export type EmsStatistics = {
  activeCount: number;
  taggedCount: number;
  releaseDatedCount: number;
  musicbrainzDateCount: number;
  tidalDateCount: number;
  firstIngestedAt: string | null;
  latestIngestedAt: string | null;
  tags: Array<{ label: string; count: number }>;
  releaseDecades: Array<{ label: string; count: number }>;
  arrivalsByDay: Array<{ label: string; count: number }>;
};

export type EmsSection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  active: boolean;
  trackCount: number;
  updatedAt: string;
};

export type Screen = "home" | "ems";

export type HomeContent = {
  id: string;
  kind: "hero" | "concept" | "guide" | "story";
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
  sortOrder: number;
  active: boolean;
  updatedAt: string;
};

export type HomeContentDraft = Pick<HomeContent, "title" | "body" | "linkLabel" | "linkHref" | "sortOrder" | "active">;

export type EmsTrack = {
  id: string;
  tidalTrackId: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  artworkUrl: string;
  playbackAvailable: boolean;
  embeddingStatus: string;
  sections: Array<{ slug: string; title: string }>;
};

export type EmsIngestRun = {
  id: string;
  runType: string;
  status: string;
  requestedCount: number;
  matchedCount: number;
  candidateCount: number;
  pendingCount: number;
  ambiguousCount: number;
  failedCount: number;
  errorCode: string | null;
  createdAt: string;
};

export type EmsAdminIngestJob = {
  id: string;
  status: string;
  phase: string;
  startingActiveCount: number;
  activeTrackCount: number;
  requestCount: number;
  nextPlaylistIndex: number;
  playlistCount: number;
  candidateCount: number;
  matchedCount: number;
  pendingCount: number;
  retryableCount: number;
  errorCode: string | null;
  nextRetryAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type EmsAdminIngestion = {
  activeTrackCount: number;
  embeddingCompletedCount: number;
  job: EmsAdminIngestJob | null;
  currentRun: {
    id: string;
    runType: string;
    status: string;
    candidateCount: number;
    processedCount: number;
    matchedCount: number;
    pendingCount: number;
    retryableCount: number;
    errorCode: string | null;
    heartbeatAt: string | null;
    startedAt: string | null;
    createdAt: string;
  } | null;
  catalogSamples: Array<{ sampledAt: string; activeTrackCount: number }>;
  runSamples: Array<{ sampledAt: string; candidateCount: number; processedCount: number; matchedCount: number }>;
  samples: Array<{ sampledAt: string; activeTrackCount: number; candidateCount: number; matchedCount: number }>;
};

export type EmsSourceRoutine = {
  key: "tidal_editorial" | "musicbrainz_core" | "musicbrainz_canonical" | "musicbrainz_metadata" | "melon_genres";
  enabled: boolean;
  intervalSeconds: number;
  status: string;
  nextCheckAt: string;
  lastCheckedAt: string | null;
  lastVersion: string | null;
  lastSuccessAt: string | null;
  lastCandidateCount: number;
  currentRunId: string | null;
  currentRunStatus: string | null;
  currentRunMatchedCount: number;
  currentRunPendingCount: number;
  errorCode: string | null;
};

export type MelonIngestJob = {
  id: string;
  status: string;
  phase: string;
  genreCode: string | null;
  genreName: string | null;
  nextStartIndex: number;
  requestCount: number;
  discoveredCount: number;
  stagedCount: number;
  matchedCount: number;
  pendingCount: number;
  batchDiscoveredCount: number;
  nextBatchAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type MelonIngestion = {
  job: MelonIngestJob | null;
  totals: { sourceTracks: number; matchedTracks: number };
  genres: Array<{ code: string; name: string; trackCount: number }>;
  tracks: Array<{
    songId: string;
    title: string;
    artist: string;
    album: string | null;
    sourceUrl: string;
    genres: string[];
    firstSeenAt: string;
    lastSeenAt: string;
    tidalId: string | null;
  }>;
};

export type ManualUrlImportItem = {
  id: string;
  sourceId: string;
  sourceItemUrl: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  artworkUrl: string | null;
  releaseDate: string | null;
  status: "review" | "approved" | "queued" | "rejected";
  collectedAt: string;
  candidateStatus: string | null;
  tidalId: string | null;
};

export type ManualUrlImportJob = {
  id: string;
  sourceType: "melon" | "tidal";
  sourceUrl: string;
  status: string;
  phase: string;
  itemCount: number;
  requestCount: number;
  errorCode: string | null;
  createdBy: string;
  collectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: ManualUrlImportItem[];
};

export type SpotifyChartTarget = {
  id: string;
  title: string;
  description: string;
};

export type SpotifyChartRun = {
  id: string;
  status: "pending" | "running" | "paused" | "completed" | "failed";
  phase: string;
  spotifyRequestBudget: number;
  spotifyRequestCount: number;
  tidalRequestBudget: number;
  tidalRequestCount: number;
  requestedCount: number;
  matchedCount: number;
  pendingCount: number;
  ambiguousCount: number;
  notFoundCount: number;
  unavailableCount: number;
  retryableCount: number;
  budgetExhaustedCount: number;
  playlistCount: number;
  membershipCount: number;
  active: boolean;
  errorCode: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  finishedAt: string | null;
  playlists: Array<{
    spotifyId: string;
    title: string;
    description: string;
    artworkUrl: string | null;
    sourceUrl: string;
    displayOrder: number;
    sourceTrackCount: number;
    matchedCount: number;
  }>;
};

export type SpotifyChartAdminData = {
  targets: SpotifyChartTarget[];
  limits: {
    playlists: number;
    tracksPerPlaylist: number;
    spotifyRequests: number;
    tidalRequests: number;
  };
  runs: SpotifyChartRun[];
};

export type EmsTrackPage = { totalCount: number; page: number; limit: number; nextPage: number | null; nextCursor: string | null; tracks: EmsTrack[] };

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "AdminApiError";
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let code = "admin_ems_unavailable";
    try {
      const body = await response.json() as { code?: unknown };
      if (typeof body.code === "string") code = body.code;
    } catch {
      // Keep the normalized fallback code.
    }
    throw new AdminApiError(response.status, code);
  }
  return response.json() as Promise<T>;
}

export function getEmsSummary() {
  return requestJson<EmsSummary>("/api/admin/ems/summary");
}

export function getAudioAnalysis(options: { query?: string; status?: AudioAnalysisStatus; page?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.status) params.set("status", options.status);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  const suffix = params.toString();
  return requestJson<AudioAnalysisAdminData>(`/api/admin/audio-analysis${suffix ? `?${suffix}` : ""}`);
}

export function getAudioAnalysisTrack(trackId: string) {
  return requestJson<AudioAnalysisTrackDetail>(`/api/admin/audio-analysis/${encodeURIComponent(trackId)}`);
}

export function requeueAudioAnalysisTrack(trackId: string, featureVersion: "essentia-dsp-v1") {
  return requestJson<{ trackId: string; status: "pending"; featureVersion: string; updatedAt: string }>(
    `/api/admin/audio-analysis/${encodeURIComponent(trackId)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ featureVersion }) },
  );
}

export function getEmsStatistics() {
  return requestJson<EmsStatistics>("/api/admin/ems/statistics");
}

export function getScreenSections(screen: Screen) {
  return requestJson<EmsSection[]>(`/api/admin/screens/${screen}/sections`);
}

export type EditorialRefreshTrack = { id: string; tidalTrackId: string; title: string; artist: string; rank: number; sourcePlaylistId: string; sourcePlaylistName: string };
export type EditorialRefreshSection = { id: string | null; slug: string; title: string; discovered: number; currentCount: number; addedCount: number; removedCount: number; tracks: EditorialRefreshTrack[] };
export type EditorialRefreshJob = {
  id: string; status: "pending" | "running" | "ready" | "blocked" | "applied" | "failed" | "expired";
  preview: { sections?: EditorialRefreshSection[]; canApply?: boolean }; errorCode: string | null;
  createdAt: string; updatedAt: string; expiresAt: string | null; appliedAt: string | null;
};
export type EditorialRefreshData = {
  criteria: Array<{ slug: string; title: string; source: string; ranking: string }>;
  lastRefreshedAt: string | null;
  limits: { playlistsPerSection: number; requestBudget: number; tracksPerSection: number; previewMinutes: number };
  jobs: EditorialRefreshJob[];
};
export function getEditorialRefreshes() { return requestJson<EditorialRefreshData>("/api/admin/ems/editorial-refresh"); }
export function previewEditorialRefresh() {
  return requestJson<{ id: string; status: "pending" }>("/api/admin/ems/editorial-refresh", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  });
}
export function applyEditorialRefresh(id: string) {
  return requestJson<EditorialRefreshJob>(`/api/admin/ems/editorial-refresh/${encodeURIComponent(id)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply" }),
  });
}

export function updateScreenSection(screen: Screen, id: string, patch: Pick<EmsSection, "title" | "description" | "sortOrder" | "active">) {
  return requestJson<EmsSection>(`/api/admin/screens/${screen}/sections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function getHomeContent() {
  return requestJson<HomeContent[]>("/api/admin/home/content");
}

export function updateHomeContent(id: string, patch: HomeContentDraft) {
  return requestJson<HomeContent>(`/api/admin/home/content/${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
  });
}

export function createHomeStory(input: HomeContentDraft) {
  return requestJson<HomeContent>("/api/admin/home/content", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  });
}

export async function deleteHomeStory(id: string) {
  const response = await fetch(`/api/admin/home/content/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new AdminApiError(response.status, "home_content_delete_failed");
}

export function getEmsTracks(options: { query?: string; page?: number; cursor?: string; limit?: number; status?: string; embeddingStatus?: string } = {}) {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.page) params.set("page", String(options.page));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  if (options.status) params.set("status", options.status);
  if (options.embeddingStatus) params.set("embeddingStatus", options.embeddingStatus);
  const suffix = params.toString();
  return requestJson<EmsTrackPage>(`/api/admin/ems/tracks${suffix ? `?${suffix}` : ""}`);
}

export function getEmsIngestRuns(options: { page?: number; limit?: number } = {}) {
  const params = new URLSearchParams({ page: String(options.page ?? 1), limit: String(options.limit ?? 20) });
  return requestJson<EmsIngestRun[]>(`/api/admin/ems/ingest-runs?${params}`);
}

export function getEmsAdminIngestion() {
  return requestJson<EmsAdminIngestion>("/api/admin/ems/ingest-jobs");
}

export function getEmsSourceRoutines() {
  return requestJson<EmsSourceRoutine[]>("/api/admin/ems/source-routines");
}

export function changeEmsSourceRoutine(key: EmsSourceRoutine["key"], action: "enable" | "disable" | "check_now") {
  return requestJson<EmsSourceRoutine>(`/api/admin/ems/source-routines/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function startEmsAdminIngestion() {
  return requestJson<{ id: string }>("/api/admin/ems/ingest-jobs", { method: "POST" });
}

export function changeEmsAdminIngestion(id: string, action: "pause" | "resume") {
  return requestJson<{ id: string; status: string }>(`/api/admin/ems/ingest-jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function getMelonIngestion() {
  return requestJson<MelonIngestion>("/api/admin/ems/melon");
}

export function startMelonIngestion() {
  return requestJson<{ id: string }>("/api/admin/ems/melon", { method: "POST" });
}

export function changeMelonIngestion(id: string, action: "pause" | "resume") {
  return requestJson<{ id: string; status: string }>(`/api/admin/ems/melon/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function getManualUrlImports() {
  return requestJson<{ jobs: ManualUrlImportJob[] }>("/api/admin/ems/url-imports");
}

export function createManualUrlImport(url: string) {
  return requestJson<{ id: string; status: string }>("/api/admin/ems/url-imports", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
  });
}

export function decideManualUrlImportItem(id: string, action: "approve" | "reject") {
  return requestJson<{ id: string; status: string }>(`/api/admin/ems/url-imports/items/${encodeURIComponent(id)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
  });
}

export function startApprovedManualUrlImport(id: string) {
  return requestJson<{ id: string; status: string }>(`/api/admin/ems/url-imports/${encodeURIComponent(id)}`, {
    method: "POST",
  });
}

export function getSpotifyChartRuns() {
  return requestJson<SpotifyChartAdminData>("/api/admin/ems/spotify-charts");
}

export function startSpotifyChartRun() {
  return requestJson<{ id: string; status: string }>("/api/admin/ems/spotify-charts", {
    method: "POST",
  });
}

export function changeSpotifyChartRun(id: string, action: "pause" | "resume") {
  return requestJson<{ id: string; status: string }>(
    `/api/admin/ems/spotify-charts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
}
