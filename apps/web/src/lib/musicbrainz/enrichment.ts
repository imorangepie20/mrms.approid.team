type Release = {
  id?: unknown;
  status?: unknown;
  title?: unknown;
  "release-group"?: { id?: unknown };
};

type Recording = {
  id?: unknown;
  releases?: unknown;
};

import {
  claimEnrichmentJob,
  completeEnrichmentJob,
  countRemainingEnrichmentJobs,
  releaseEnrichmentJob,
  reserveMusicBrainzRequest,
  retryEnrichmentJob,
} from "@/lib/db/music-library";

import { lookupIsrc, MusicBrainzError } from "./client";

export type EnrichmentDecision = {
  coverArtUrl: string | null;
  recordingId: string | null;
  releaseGroupId: string | null;
  releaseId: string | null;
  status: "not_found" | "matched" | "ambiguous";
};

type EnrichmentJob = {
  albumName: string;
  attemptCount: number;
  isrc: string;
  title: string;
  trackId: string;
};

export type EnrichmentDependencies = {
  claimJob: (auth0Subject: string) => Promise<EnrichmentJob | null>;
  completeJob: (
    auth0Subject: string,
    trackId: string,
    decision: EnrichmentDecision,
  ) => Promise<unknown>;
  countRemaining: (auth0Subject: string) => Promise<number>;
  lookup: (isrc: string) => Promise<{ recordings: unknown[] }>;
  releaseJob: (auth0Subject: string, trackId: string) => Promise<unknown>;
  reserveRequest: () => Promise<boolean>;
  retryJob: (
    auth0Subject: string,
    trackId: string,
    attemptCount: number,
    errorCode: string,
  ) => Promise<unknown>;
};

const productionDependencies: EnrichmentDependencies = {
  claimJob: claimEnrichmentJob,
  completeJob: completeEnrichmentJob,
  countRemaining: countRemainingEnrichmentJobs,
  lookup: lookupIsrc,
  releaseJob: releaseEnrichmentJob,
  reserveRequest: reserveMusicBrainzRequest,
  retryJob: retryEnrichmentJob,
};

function normalizedTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyRecordings(
  document: { recordings?: unknown },
  tidalAlbumName: string,
): EnrichmentDecision {
  const candidates = Array.isArray(document.recordings)
    ? (document.recordings as Recording[])
    : [];
  const recordings = new Map<string, Recording>();
  for (const recording of candidates) {
    if (typeof recording.id === "string") recordings.set(recording.id, recording);
  }
  if (recordings.size === 0) {
    return {
      coverArtUrl: null,
      recordingId: null,
      releaseGroupId: null,
      releaseId: null,
      status: "not_found",
    };
  }
  if (recordings.size > 1) {
    return {
      coverArtUrl: null,
      recordingId: null,
      releaseGroupId: null,
      releaseId: null,
      status: "ambiguous",
    };
  }

  const [recordingId, recording] = [...recordings.entries()][0];
  const targetAlbum = normalizedTitle(tidalAlbumName);
  const releases = (Array.isArray(recording.releases)
    ? (recording.releases as Release[])
    : []
  ).filter(
    (release) =>
      release.status === "Official" &&
      typeof release.id === "string" &&
      typeof release.title === "string" &&
      normalizedTitle(release.title) === targetAlbum,
  );
  if (releases.length !== 1) {
    return {
      coverArtUrl: null,
      recordingId,
      releaseGroupId: null,
      releaseId: null,
      status: "matched",
    };
  }

  const release = releases[0];
  const releaseId = release.id as string;
  const releaseGroupId =
    typeof release["release-group"]?.id === "string"
      ? release["release-group"].id
      : null;
  return {
    coverArtUrl: releaseGroupId
      ? `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`
      : `https://coverartarchive.org/release/${releaseId}/front-500`,
    recordingId,
    releaseGroupId,
    releaseId,
    status: "matched",
  };
}

export async function enrichNextTrack(
  auth0Subject: string,
  dependencies: EnrichmentDependencies = productionDependencies,
) {
  const job = await dependencies.claimJob(auth0Subject);
  if (!job) {
    return {
      processed: false,
      remaining: await dependencies.countRemaining(auth0Subject),
    };
  }

  const reserved = await dependencies.reserveRequest();
  if (!reserved) {
    await dependencies.releaseJob(auth0Subject, job.trackId);
    return {
      processed: false,
      remaining: await dependencies.countRemaining(auth0Subject),
    };
  }

  try {
    const document = await dependencies.lookup(job.isrc);
    const decision = classifyRecordings(document, job.albumName);
    await dependencies.completeJob(auth0Subject, job.trackId, decision);
    return {
      processed: true,
      remaining: await dependencies.countRemaining(auth0Subject),
    };
  } catch (error) {
    const retryable =
      (error instanceof MusicBrainzError && error.kind === "retryable") ||
      error instanceof TypeError;
    await dependencies.retryJob(
      auth0Subject,
      job.trackId,
      retryable ? job.attemptCount : 5,
      retryable ? "musicbrainz_retryable" : "musicbrainz_invalid_response",
    );
    return {
      processed: false,
      remaining: await dependencies.countRemaining(auth0Subject),
    };
  }
}
