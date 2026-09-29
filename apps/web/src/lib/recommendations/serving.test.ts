import { describe, expect, it } from "vitest";

import {
  decideRecommendationServing,
  parseRecommendationServingConfig,
} from "./serving";

describe("recommendation serving", () => {
  it("fails closed to baseline when ranking configuration is absent or invalid", () => {
    expect(parseRecommendationServingConfig({})).toEqual({
      hybridAuth0Subjects: [],
      minimumAudioCoverage: null,
      requestedRankingVersion: "baseline",
    });
    expect(parseRecommendationServingConfig({
      GMS_HYBRID_AUTH0_SUBJECTS: "* auth0|listener",
      GMS_HYBRID_MIN_AUDIO_COVERAGE: "not-a-number",
      GMS_RANKING_VERSION: "hybrid-v1",
    })).toEqual({
      hybridAuth0Subjects: ["auth0|listener"],
      minimumAudioCoverage: null,
      requestedRankingVersion: "baseline",
    });
  });

  it("parses an explicit hybrid cohort and bounded coverage threshold", () => {
    expect(parseRecommendationServingConfig({
      GMS_HYBRID_AUTH0_SUBJECTS: " auth0|one,auth0|two\n auth0|one ",
      GMS_HYBRID_MIN_AUDIO_COVERAGE: "0.65",
      GMS_RANKING_VERSION: "hybrid-v0",
    })).toEqual({
      hybridAuth0Subjects: ["auth0|one", "auth0|two"],
      minimumAudioCoverage: 0.65,
      requestedRankingVersion: "hybrid-v0",
    });
  });

  it.each([
    [{}, "ranking_disabled"],
    [{
      GMS_HYBRID_AUTH0_SUBJECTS: "auth0|other",
      GMS_HYBRID_MIN_AUDIO_COVERAGE: "0.5",
      GMS_RANKING_VERSION: "hybrid-v0",
    }, "subject_not_allowlisted"],
    [{
      GMS_HYBRID_AUTH0_SUBJECTS: "auth0|listener",
      GMS_RANKING_VERSION: "hybrid-v0",
    }, "coverage_threshold_unconfigured"],
  ])("returns baseline for disabled configuration %#", (environment, fallbackReason) => {
    expect(decideRecommendationServing({
      audioCoverageRatio: 0.8,
      audioProfileAvailable: true,
      auth0Subject: "auth0|listener",
      environment,
    })).toMatchObject({
      fallbackReason,
      servedRankingVersion: "baseline",
    });
  });

  it("requires an audio profile and the configured candidate coverage", () => {
    const environment = {
      GMS_HYBRID_AUTH0_SUBJECTS: "auth0|listener",
      GMS_HYBRID_MIN_AUDIO_COVERAGE: "0.6",
      GMS_RANKING_VERSION: "hybrid-v0",
    };

    expect(decideRecommendationServing({
      audioCoverageRatio: 0.8,
      audioProfileAvailable: false,
      auth0Subject: "auth0|listener",
      environment,
    })).toMatchObject({
      fallbackReason: "audio_profile_unavailable",
      servedRankingVersion: "baseline",
    });
    expect(decideRecommendationServing({
      audioCoverageRatio: 0.59,
      audioProfileAvailable: true,
      auth0Subject: "auth0|listener",
      environment,
    })).toMatchObject({
      fallbackReason: "audio_coverage_below_threshold",
      servedRankingVersion: "baseline",
    });
    expect(decideRecommendationServing({
      audioCoverageRatio: 0.6,
      audioProfileAvailable: true,
      auth0Subject: "auth0|listener",
      environment,
    })).toEqual({
      fallbackReason: null,
      minimumAudioCoverage: 0.6,
      requestedRankingVersion: "hybrid-v0",
      servedRankingVersion: "hybrid-v0",
    });
  });
});
