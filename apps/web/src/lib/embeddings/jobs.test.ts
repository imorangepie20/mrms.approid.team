import { describe, expect, it, vi } from "vitest";

import type {
  ClaimedEmbeddingJob,
  CompletedEmbeddingJob,
} from "@/lib/db/embeddings";
import type {
  TasteProfileInput,
  TasteProfileResult,
} from "@/lib/recommendations/taste-profile";

import { EmbeddingClientError } from "./client";
import {
  processEmbeddingBatch,
  type EmbeddingJobDependencies,
} from "./jobs";

function job(trackId: string): ClaimedEmbeddingJob {
  return {
    attemptCount: 1,
    inputHash: `hash-${trackId}`,
    inputText: `text-${trackId}`,
    trackId,
  };
}

function statefulDependencies(
  jobs: ClaimedEmbeddingJob[],
  embed: EmbeddingJobDependencies["embed"] = vi.fn(async (texts: string[]) => ({
    embeddings: texts.map((_, index) => [index + 1]),
    modelId: "model-a",
    modelRevision: "revision-a",
  })),
) {
  const statuses = new Map(jobs.map((item) => [item.trackId, "pending"]));
  const completed: CompletedEmbeddingJob[] = [];
  const calls: string[] = [];
  const dependencies: EmbeddingJobDependencies = {
    buildProfile: vi.fn((inputs: TasteProfileInput[]): TasteProfileResult => ({
      centroids: [{
        clusterIndex: 0,
        embedding: [1],
        trackCount: inputs.length,
        weight: 1,
      }],
      uniqueTrackCount: inputs.length,
    })),
    claimJobs: vi.fn(async (_subject, limit) => {
      calls.push("claim");
      const claimed = jobs
        .filter((item) => statuses.get(item.trackId) === "pending")
        .slice(0, limit);
      claimed.forEach((item) => statuses.set(item.trackId, "running"));
      return claimed;
    }),
    completeJobs: vi.fn(async (
      _subject: string,
      completedJobs: CompletedEmbeddingJob[],
    ) => {
      calls.push("complete");
      completed.push(...completedJobs);
      completedJobs.forEach((item) => statuses.set(item.trackId, "completed"));
    }),
    countFailed: vi.fn(async () => {
      calls.push("countFailed");
      return [...statuses.values()].filter((status) => status === "failed").length;
    }),
    countRemaining: vi.fn(async () => {
      calls.push("countRemaining");
      return [...statuses.values()].filter(
        (status) => status === "pending" || status === "running",
      ).length;
    }),
    embed,
    loadProfileInputs: vi.fn(async () => {
      calls.push("loadProfile");
      return jobs.map((item) => ({
        artist: item.trackId,
        embedding: [1],
        playlistCount: 1,
        trackId: item.trackId,
      }));
    }),
    replaceProfile: vi.fn(async () => {
      calls.push("replaceProfile");
    }),
    retryJobs: vi.fn(async (
      _subject: string,
      claimedJobs: ClaimedEmbeddingJob[],
    ) => {
      calls.push("retry");
      claimedJobs.forEach((item) => statuses.set(item.trackId, "pending"));
    }),
    syncJobs: vi.fn(async () => {
      calls.push("sync");
      return jobs.length;
    }),
  };
  return { calls, completed, dependencies, statuses };
}

describe("embedding batch processing", () => {
  it("syncs jobs, embeds one batch, and stores vectors against matching track ids", async () => {
    const state = statefulDependencies([job("track-a"), job("track-b")]);

    await expect(
      processEmbeddingBatch("auth0|listener", state.dependencies),
    ).resolves.toEqual({
      embeddedTrackCount: 2,
      failedTrackCount: 0,
      profileReady: true,
      remaining: 0,
    });
    expect(state.completed.map(({ embedding, trackId }) => ({ embedding, trackId })))
      .toEqual([
        { embedding: [1], trackId: "track-a" },
        { embedding: [2], trackId: "track-b" },
      ]);
    expect(state.calls).toEqual([
      "sync",
      "claim",
      "complete",
      "countRemaining",
      "countFailed",
      "loadProfile",
      "replaceProfile",
    ]);
  });

  it("returns remaining work without calling the model when no jobs are claimable", async () => {
    const embed = vi.fn();
    const dependencies: EmbeddingJobDependencies = {
      buildProfile: vi.fn(),
      claimJobs: vi.fn().mockResolvedValue([]),
      completeJobs: vi.fn(),
      countFailed: vi.fn().mockResolvedValue(1),
      countRemaining: vi.fn().mockResolvedValue(3),
      embed,
      loadProfileInputs: vi.fn(),
      replaceProfile: vi.fn(),
      retryJobs: vi.fn(),
      syncJobs: vi.fn().mockResolvedValue(10),
    };

    await expect(
      processEmbeddingBatch("auth0|listener", dependencies),
    ).resolves.toEqual({
      embeddedTrackCount: 6,
      failedTrackCount: 1,
      profileReady: false,
      remaining: 3,
    });
    expect(embed).not.toHaveBeenCalled();
    expect(dependencies.replaceProfile).not.toHaveBeenCalled();
  });

  it("returns every claimed job to retryable state when the batch request times out", async () => {
    const state = statefulDependencies(
      [job("track-a"), job("track-b")],
      vi.fn().mockRejectedValue(
        new EmbeddingClientError("embedding_service_unavailable"),
      ),
    );

    await expect(
      processEmbeddingBatch("auth0|listener", state.dependencies),
    ).rejects.toMatchObject({ code: "embedding_service_unavailable" });
    expect([...state.statuses.values()]).toEqual(["pending", "pending"]);
    expect(state.completed).toEqual([]);
  });

  it("never completes a job when response count differs from claim count", async () => {
    const state = statefulDependencies(
      [job("track-a"), job("track-b")],
      vi.fn().mockResolvedValue({
        embeddings: [[1]],
        modelId: "model-a",
        modelRevision: "revision-a",
      }),
    );

    await expect(
      processEmbeddingBatch("auth0|listener", state.dependencies),
    ).rejects.toMatchObject({ code: "embedding_response_invalid" });
    expect([...state.statuses.values()]).toEqual(["pending", "pending"]);
    expect(state.completed).toEqual([]);
  });
});
