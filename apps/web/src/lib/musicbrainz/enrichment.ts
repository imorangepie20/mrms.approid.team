type Release = {
  id?: unknown;
  status?: unknown;
  title?: unknown;
  "release-group"?: { id?: unknown };
};

type ArtistCredit = {
  artist?: { id?: unknown };
};

type Recording = {
  "artist-credit"?: unknown;
  id?: unknown;
  releases?: unknown;
};

import {
  claimEnrichmentJob,
  completeEnrichmentJob,
  countRemainingEnrichmentJobs,
  getCachedArtistGenres,
  getMusicBrainzSlotDelay,
  releaseEnrichmentJob,
  reserveMusicBrainzRequest,
  retryEnrichmentJob,
  upsertArtistGenres,
} from "@/lib/db/music-library";

import { lookupArtist, lookupIsrc, MusicBrainzError } from "./client";

export type EnrichmentDecision = {
  coverArtUrl: string | null;
  genres: string[];
  recordingId: string | null;
  releaseGroupId: string | null;
  releaseId: string | null;
  status: "not_found" | "matched" | "ambiguous";
  tags: string[];
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
  lookupArtistGenres: (
    mbid: string,
  ) => Promise<{ genres: string[]; name: string; tags: string[] }>;
  lookupCachedArtist: (mbid: string) => Promise<{
    genres: string[];
    tags: string[];
  } | null>;
  releaseJob: (auth0Subject: string, trackId: string) => Promise<unknown>;
  reserveRequest: () => Promise<boolean>;
  retryJob: (
    auth0Subject: string,
    trackId: string,
    attemptCount: number,
    errorCode: string,
  ) => Promise<unknown>;
  slotDelay: () => Promise<number>;
  storeArtist: (
    mbid: string,
    name: string,
    genres: string[],
    tags: string[],
  ) => Promise<unknown>;
};

const productionDependencies: EnrichmentDependencies = {
  claimJob: claimEnrichmentJob,
  completeJob: completeEnrichmentJob,
  countRemaining: countRemainingEnrichmentJobs,
  lookup: lookupIsrc,
  lookupArtistGenres: async (mbid) => {
    const artist = await lookupArtist(mbid);
    return {
      genres: artist.genres.map((genre) => genre.name),
      name: artist.name,
      tags: artist.tags.map((tag) => tag.name),
    };
  },
  lookupCachedArtist: getCachedArtistGenres,
  releaseJob: releaseEnrichmentJob,
  reserveRequest: reserveMusicBrainzRequest,
  retryJob: retryEnrichmentJob,
  slotDelay: () => getMusicBrainzSlotDelay(),
  storeArtist: upsertArtistGenres,
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
      genres: [],
      recordingId: null,
      releaseGroupId: null,
      releaseId: null,
      status: "not_found",
      tags: [],
    };
  }
  if (recordings.size > 1) {
    return {
      coverArtUrl: null,
      genres: [],
      recordingId: null,
      releaseGroupId: null,
      releaseId: null,
      status: "ambiguous",
      tags: [],
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
      genres: [],
      recordingId,
      releaseGroupId: null,
      releaseId: null,
      status: "matched",
      tags: [],
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
    genres: [],
    recordingId,
    releaseGroupId,
    releaseId,
    status: "matched",
    tags: [],
  };
}

export function extractArtistMbids(document: {
  recordings?: unknown;
}): string[] {
  const candidates = Array.isArray(document.recordings)
    ? (document.recordings as Recording[])
    : [];
  const mbids: string[] = [];
  for (const recording of candidates) {
    const credits = Array.isArray(recording["artist-credit"])
      ? (recording["artist-credit"] as ArtistCredit[])
      : [];
    for (const credit of credits) {
      const mbid = credit.artist?.id;
      if (typeof mbid === "string" && !mbids.includes(mbid)) mbids.push(mbid);
    }
  }
  return mbids;
}

function mergeRankedNames(lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const name of list) {
      if (!seen.has(name)) {
        seen.add(name);
        merged.push(name);
      }
    }
  }
  return merged;
}

const ARTIST_RESERVE_ATTEMPTS = 10;
const SLOT_BUFFER_MS = 150;

async function reserveArtistSlot(
  dependencies: EnrichmentDependencies,
): Promise<boolean> {
  for (let attempt = 0; attempt < ARTIST_RESERVE_ATTEMPTS; attempt += 1) {
    if (await dependencies.reserveRequest()) return true;

    const delay = await dependencies.slotDelay();
    await new Promise((resolve) => setTimeout(resolve, delay + SLOT_BUFFER_MS));
  }
  return false;
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
    const artistMbids = extractArtistMbids(document);

    const genreLists: string[][] = [];
    const tagLists: string[][] = [];
    for (const mbid of artistMbids) {
      const cached = await dependencies.lookupCachedArtist(mbid);
      if (cached) {
        genreLists.push(cached.genres);
        tagLists.push(cached.tags);
        continue;
      }

      const reservedArtist = await reserveArtistSlot(dependencies);
      if (!reservedArtist) {
        await dependencies.releaseJob(auth0Subject, job.trackId);
        return {
          processed: false,
          remaining: await dependencies.countRemaining(auth0Subject),
        };
      }

      const artist = await dependencies.lookupArtistGenres(mbid);
      await dependencies.storeArtist(mbid, artist.name, artist.genres, artist.tags);
      genreLists.push(artist.genres);
      tagLists.push(artist.tags);
    }

    await dependencies.completeJob(auth0Subject, job.trackId, {
      ...decision,
      genres: mergeRankedNames(genreLists),
      tags: mergeRankedNames(tagLists),
    });
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
