export type RecommendationRankingVersion = "baseline" | "hybrid-v0";

export type RecommendationServingFallbackReason =
  | "ranking_disabled"
  | "subject_not_allowlisted"
  | "coverage_threshold_unconfigured"
  | "audio_profile_unavailable"
  | "audio_coverage_below_threshold";

export type RecommendationServingConfig = {
  hybridAuth0Subjects: string[];
  minimumAudioCoverage: number | null;
  requestedRankingVersion: RecommendationRankingVersion;
};

export type RecommendationServingDecision = {
  fallbackReason: RecommendationServingFallbackReason | null;
  minimumAudioCoverage: number | null;
  requestedRankingVersion: RecommendationRankingVersion;
  servedRankingVersion: RecommendationRankingVersion;
};

export type ServingEnvironment = {
  [key: string]: string | undefined;
  GMS_HYBRID_AUTH0_SUBJECTS?: string;
  GMS_HYBRID_MIN_AUDIO_COVERAGE?: string;
  GMS_RANKING_VERSION?: string;
};

function parseSubjects(value: string | undefined): string[] {
  return [...new Set(
    (value ?? "")
      .split(/[\s,]+/)
      .map((subject) => subject.trim())
      .filter((subject) => Boolean(subject) && subject !== "*"),
  )];
}

function parseCoverage(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : null;
}

export function parseRecommendationServingConfig(
  environment: ServingEnvironment = process.env,
): RecommendationServingConfig {
  return {
    hybridAuth0Subjects: parseSubjects(environment.GMS_HYBRID_AUTH0_SUBJECTS),
    minimumAudioCoverage: parseCoverage(environment.GMS_HYBRID_MIN_AUDIO_COVERAGE),
    requestedRankingVersion: environment.GMS_RANKING_VERSION?.trim() === "hybrid-v0"
      ? "hybrid-v0"
      : "baseline",
  };
}

export function decideRecommendationServing(input: {
  audioCoverageRatio: number;
  audioProfileAvailable: boolean;
  auth0Subject: string;
  environment?: ServingEnvironment;
}): RecommendationServingDecision {
  const config = parseRecommendationServingConfig(input.environment);
  const fallback = (
    fallbackReason: RecommendationServingFallbackReason,
  ): RecommendationServingDecision => ({
    fallbackReason,
    minimumAudioCoverage: config.minimumAudioCoverage,
    requestedRankingVersion: config.requestedRankingVersion,
    servedRankingVersion: "baseline",
  });

  if (config.requestedRankingVersion !== "hybrid-v0") {
    return fallback("ranking_disabled");
  }
  if (!config.hybridAuth0Subjects.includes(input.auth0Subject)) {
    return fallback("subject_not_allowlisted");
  }
  if (config.minimumAudioCoverage === null) {
    return fallback("coverage_threshold_unconfigured");
  }
  if (!input.audioProfileAvailable) {
    return fallback("audio_profile_unavailable");
  }
  if (input.audioCoverageRatio < config.minimumAudioCoverage) {
    return fallback("audio_coverage_below_threshold");
  }
  return {
    fallbackReason: null,
    minimumAudioCoverage: config.minimumAudioCoverage,
    requestedRankingVersion: config.requestedRankingVersion,
    servedRankingVersion: "hybrid-v0",
  };
}
