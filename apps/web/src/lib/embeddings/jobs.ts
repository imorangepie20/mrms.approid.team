import {
  claimEmbeddingJobs,
  completeEmbeddingJobs,
  countFailedEmbeddingJobs,
  countPendingEmbeddingJobs,
  retryEmbeddingJobs,
  syncEmbeddingJobs,
  type ClaimedEmbeddingJob,
  type CompletedEmbeddingJob,
} from "@/lib/db/embeddings";
import { getSharedGenreVocabulary } from "@/lib/db/music-library";
import {
  loadCompletedTasteProfileInputs,
  replaceTasteProfile,
} from "@/lib/db/taste-profiles";
import {
  buildTasteProfile,
  type TasteProfileInput,
  type TasteProfileResult,
} from "@/lib/recommendations/taste-profile";

import {
  embedTexts,
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODEL_REVISION,
  EmbeddingClientError,
  type EmbeddingBatch,
} from "./client";

export type AnalysisProgress = {
  embeddedTrackCount: number;
  failedTrackCount: number;
  profileReady: boolean;
  remaining: number;
};

export type EmbeddingJobDependencies = {
  buildProfile: (inputs: TasteProfileInput[]) => TasteProfileResult;
  claimJobs: (
    auth0Subject: string,
    limit: number,
  ) => Promise<ClaimedEmbeddingJob[]>;
  completeJobs: (
    auth0Subject: string,
    jobs: CompletedEmbeddingJob[],
  ) => Promise<void>;
  countFailed: (auth0Subject: string) => Promise<number>;
  countRemaining: (auth0Subject: string) => Promise<number>;
  embed: (texts: string[]) => Promise<EmbeddingBatch>;
  loadProfileInputs: (auth0Subject: string) => Promise<TasteProfileInput[]>;
  replaceProfile: (
    auth0Subject: string,
    result: TasteProfileResult,
  ) => Promise<void>;
  retryJobs: (
    auth0Subject: string,
    jobs: ClaimedEmbeddingJob[],
    errorCode: string,
  ) => Promise<void>;
  syncJobs: (auth0Subject: string) => Promise<number>;
};

const productionDependencies: EmbeddingJobDependencies = {
  buildProfile: buildTasteProfile,
  claimJobs: claimEmbeddingJobs,
  completeJobs: completeEmbeddingJobs,
  countFailed: countFailedEmbeddingJobs,
  countRemaining: countPendingEmbeddingJobs,
  embed: embedTexts,
  loadProfileInputs: loadCompletedTasteProfileInputs,
  replaceProfile: (auth0Subject, result) => replaceTasteProfile(
    auth0Subject,
    result,
    {
      algorithmVersion: "taste-v1",
      modelId: EMBEDDING_MODEL_ID,
      modelRevision: EMBEDDING_MODEL_REVISION,
    },
  ),
  retryJobs: retryEmbeddingJobs,
  syncJobs: async (auth0Subject) => syncEmbeddingJobs(
    auth0Subject,
    {
      modelId: EMBEDDING_MODEL_ID,
      modelRevision: EMBEDDING_MODEL_REVISION,
    },
    await getSharedGenreVocabulary(),
  ),
};

async function progress(
  auth0Subject: string,
  totalTrackCount: number,
  dependencies: EmbeddingJobDependencies,
): Promise<AnalysisProgress> {
  const remaining = await dependencies.countRemaining(auth0Subject);
  const failedTrackCount = await dependencies.countFailed(auth0Subject);
  const result: AnalysisProgress = {
    embeddedTrackCount: Math.max(
      totalTrackCount - remaining - failedTrackCount,
      0,
    ),
    failedTrackCount,
    profileReady: false,
    remaining,
  };
  if (remaining === 0 && failedTrackCount === 0) {
    const inputs = await dependencies.loadProfileInputs(auth0Subject);
    const profile = dependencies.buildProfile(inputs);
    await dependencies.replaceProfile(auth0Subject, profile);
    result.profileReady = true;
  }
  return result;
}

export async function processEmbeddingBatch(
  auth0Subject: string,
  dependencies: EmbeddingJobDependencies = productionDependencies,
): Promise<AnalysisProgress> {
  const totalTrackCount = await dependencies.syncJobs(auth0Subject);
  const jobs = await dependencies.claimJobs(auth0Subject, 16);
  if (jobs.length === 0) {
    return progress(auth0Subject, totalTrackCount, dependencies);
  }

  try {
    const batch = await dependencies.embed(jobs.map((job) => job.inputText));
    if (batch.embeddings.length !== jobs.length) {
      throw new EmbeddingClientError("embedding_response_invalid");
    }
    await dependencies.completeJobs(
      auth0Subject,
      jobs.map((job, index) => ({
        ...job,
        embedding: batch.embeddings[index],
      })),
    );
  } catch (error) {
    const errorCode = error instanceof EmbeddingClientError
      ? error.code
      : "embedding_processing_failed";
    await dependencies.retryJobs(auth0Subject, jobs, errorCode);
    throw error;
  }

  return progress(auth0Subject, totalTrackCount, dependencies);
}
