export type EmsSummary = {
  activeTrackCount: number;
  activeSectionCount: number;
  artworkMissingCount: number;
  embeddingCounts: Record<string, number>;
  latestIngest: EmsIngestRun | null;
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
  samples: Array<{ sampledAt: string; activeTrackCount: number; candidateCount: number; matchedCount: number }>;
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

export function getEmsSections() {
  return requestJson<EmsSection[]>("/api/admin/ems/sections");
}

export function updateEmsSection(id: string, patch: Pick<EmsSection, "title" | "description" | "sortOrder" | "active">) {
  return requestJson<EmsSection>(`/api/admin/ems/sections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
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
