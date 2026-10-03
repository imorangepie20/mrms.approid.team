import type { Track } from "@/lib/music/types";
import { AUDIO_PREDICTION_LABELS } from "@/lib/recommendations/audio-taste-profile";
import { evaluateShadowRanking } from "@/lib/recommendations/candidates";
import { filterRankingCandidates } from "@/lib/recommendations/filters";
import { calculateEmsScore } from "@/lib/recommendations/gms";
import {
  calculateHybridScore,
  type HybridScoreComponents,
} from "@/lib/recommendations/hybrid-score";
import { rankHybridCandidates } from "@/lib/recommendations/selector";
import {
  decideRecommendationServing,
  type RecommendationRankingVersion,
  type RecommendationServingDecision,
  type ServingEnvironment,
} from "@/lib/recommendations/serving";

import type { TransactionExecutor } from "./music-library";
import { getDatabasePool } from "./pool";

type ProfileRow = {
  algorithm_version: string;
  audio_model_revision: string | null;
  audio_prediction_features: unknown | null;
  audio_profile_id: string | null;
  audio_profile_version: string | null;
  audio_summary_features: unknown | null;
  id: string;
  user_id: string;
};

export type EmsCandidateRow = {
  album: string | null;
  artist: string;
  artwork_url: string | null;
  audio_discarded?: boolean;
  audio_error_code?: string | null;
  audio_job_status?: string | null;
  audio_similarity_cluster?: number | null;
  audio_similarity_global?: number | null;
  candidate_bpm?: number | null;
  candidate_predictions?: unknown | null;
  catalog_priority: number;
  duration_ms: number;
  freshness: number;
  id: string;
  is_active?: boolean;
  is_playable?: boolean;
  match_confidence: number;
  similarity_cluster: number | null;
  similarity_global: number;
  source_rank?: number;
  tidal_id: string;
  title: string;
};

const TERMINAL_AUDIO_CANDIDATE_ERROR_CODES = [
  "preview_forbidden",
  "preview_info_rejected",
  "preview_unavailable",
] as const;

const RECOMMENDATION_SHADOW_RETENTION_DAYS = 30;
const RECOMMENDATION_SHADOW_MAX_RUNS_PER_USER = 100;

export function isTerminalAudioCandidateFailure(
  status: string | null | undefined,
  errorCode: string | null | undefined,
): boolean {
  return status === "failed"
    && TERMINAL_AUDIO_CANDIDATE_ERROR_CODES.some((code) => code === errorCode);
}

export type RecommendationScoreComponents = {
  audio?: number;
  baseScore?: number;
  catalogPriority: number;
  diversity: number;
  freshness: number;
  hybridSimilarity?: number;
  matchConfidence: number;
  mood?: number;
  rhythm?: number;
  selectorScore?: number;
  similarity: number;
  text?: number;
};

export type EmsRecommendationTrack = Track & {
  recommendation: {
    rankingVersion: RecommendationRankingVersion;
    reasonCodes: string[];
    score: number;
    scoreComponents: RecommendationScoreComponents;
  };
};

export type PersonalizedRecommendations = {
  profileReady: boolean;
  profileVersion: string | null;
  rankingVersion: RecommendationRankingVersion;
  tracks: EmsRecommendationTrack[];
};

export type RecommendationShadowCandidate = {
  audioAvailable: boolean;
  baselineRank: number;
  baselineScore: number;
  components: HybridScoreComponents;
  fallbackUsed: boolean;
  hybridBaseRank: number;
  hybridScore: number;
  hybridSelectedRank: number;
  moodAvailable: boolean;
  reasonCodes: string[];
  rhythmAvailable: boolean;
  selectorChanged: boolean;
  selectorScore: number;
  trackId: string;
};

export type RecommendationShadowPayload = {
  audioCoverageRatio: number;
  audioDiscardedCandidates: Array<{
    errorCode: string;
    trackId: string;
  }>;
  audioModelRevision: string | null;
  audioProfileId: string | null;
  audioProfileVersion: string | null;
  baselineTrackIds: string[];
  backfilledTrackIds: string[];
  candidateCount: number;
  candidates: RecommendationShadowCandidate[];
  fallbackUsed: boolean;
  hybridTrackIds: string[];
  meanAbsoluteRankDisplacement: number;
  moodCoverageRatio: number;
  overlapAtK: number;
  rankingVersion: "hybrid-v0";
  requestedLimit: number;
  rhythmCoverageRatio: number;
  sameArtistRatio: number;
  selectorChangedCount: number;
  servedBaselineTrackIds: string[];
  textProfileId: string;
  textProfileVersion: string;
  userId: string;
};

export type PreparedPersonalizedRecommendations = {
  hybridRecommendations: PersonalizedRecommendations | null;
  recommendations: PersonalizedRecommendations;
  shadow: RecommendationShadowPayload | null;
};

export type SelectedPersonalizedRecommendations = {
  recommendations: PersonalizedRecommendations;
  serving: RecommendationServingDecision;
};

export type RecommendationDecision = {
  decision: "accept" | "reject" | "skip";
  profileVersion: string;
  rankingVersion: RecommendationRankingVersion;
  reasonCodes: string[];
  scoreComponents: Record<string, number>;
  sourceTrackId: string;
};

function database(executor?: TransactionExecutor) {
  return executor ?? getDatabasePool();
}

type ReleasableExecutor = TransactionExecutor & {
  release?: () => void;
};

function numericRecord(value: unknown): Record<string, number> | null {
  if (typeof value === "string") {
    try {
      return numericRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "number" || !Number.isFinite(item))) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function profileBpm(value: unknown): number | null {
  if (typeof value === "string") {
    try {
      return profileBpm(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rhythm = (value as { rhythm?: unknown }).rhythm;
  if (!rhythm || typeof rhythm !== "object" || Array.isArray(rhythm)) return null;
  const bpm = (rhythm as { bpm?: unknown }).bpm;
  return typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function similarity(row: EmsCandidateRow) {
  return row.similarity_cluster === null
    ? row.similarity_global
    : 0.3 * row.similarity_global + 0.7 * row.similarity_cluster;
}

function score(row: EmsCandidateRow, diversity: number) {
  const components: RecommendationScoreComponents = {
    catalogPriority: row.catalog_priority,
    diversity,
    freshness: row.freshness,
    matchConfidence: row.match_confidence,
    similarity: similarity(row),
  };
  return {
    components,
    score: calculateEmsScore({
      catalogPriority: components.catalogPriority,
      diversity: components.diversity,
      freshness: components.freshness,
      matchConfidence: components.matchConfidence,
      similarity: components.similarity,
    }),
  };
}

export function rankEmsCandidates(
  rows: EmsCandidateRow[],
  limit: number,
) {
  const remaining = [...rows];
  const selected: Array<EmsCandidateRow & {
    recommendation: {
      score: number;
      scoreComponents: RecommendationScoreComponents;
    };
  }> = [];

  while (remaining.length > 0 && selected.length < limit) {
    const ranked = remaining.map((row) => {
      const repeatedArtist = selected.some((candidate) => candidate.artist === row.artist);
      const rankedScore = score(row, repeatedArtist ? 0.25 : 1);
      return { row, ...rankedScore };
    });
    ranked.sort((left, right) =>
      right.score - left.score || left.row.id.localeCompare(right.row.id),
    );
    const next = ranked[0];
    if (!next) break;
    selected.push({
      ...next.row,
      recommendation: {
        score: next.score,
        scoreComponents: next.components,
      },
    });
    const index = remaining.findIndex((row) => row.id === next.row.id);
    remaining.splice(index, 1);
  }

  return selected;
}

function candidateAudioSimilarity(row: EmsCandidateRow): number | null {
  if (row.audio_similarity_global === null || row.audio_similarity_global === undefined) {
    return null;
  }
  return row.audio_similarity_cluster === null || row.audio_similarity_cluster === undefined
    ? row.audio_similarity_global
    : 0.3 * row.audio_similarity_global + 0.7 * row.audio_similarity_cluster;
}

function buildShadowPayload(
  profile: ProfileRow,
  rows: EmsCandidateRow[],
  baseline: ReturnType<typeof rankEmsCandidates>,
  limit: number,
  provenance: Pick<
    RecommendationShadowPayload,
    "audioDiscardedCandidates" | "backfilledTrackIds" | "servedBaselineTrackIds"
  >,
): RecommendationShadowPayload {
  const bpm = profileBpm(profile.audio_summary_features);
  const profilePredictions = numericRecord(profile.audio_prediction_features);
  const scored = rows.map((row) => {
    const hybrid = calculateHybridScore({
      audio: candidateAudioSimilarity(row),
      candidateBpm: row.candidate_bpm ?? null,
      candidatePredictions: numericRecord(row.candidate_predictions),
      catalog: row.match_confidence,
      editorial: row.catalog_priority,
      freshness: row.freshness,
      profileBpm: bpm,
      profilePredictions,
      text: similarity(row),
    });
    return { ...row, ...hybrid };
  });
  const hybrid = rankHybridCandidates(scored);
  const evaluation = evaluateShadowRanking(baseline, hybrid, limit);
  const baselineRanks = new Map(baseline.map((candidate, index) => [candidate.id, index + 1]));
  const baselineScores = new Map(baseline.map((candidate) => [
    candidate.id,
    candidate.recommendation.score,
  ]));

  return {
    audioCoverageRatio: evaluation.audioCoverageRatio,
    audioDiscardedCandidates: provenance.audioDiscardedCandidates,
    audioModelRevision: profile.audio_model_revision,
    audioProfileId: profile.audio_profile_id,
    audioProfileVersion: profile.audio_profile_version,
    baselineTrackIds: baseline.slice(0, limit).map((candidate) => candidate.id),
    backfilledTrackIds: provenance.backfilledTrackIds,
    candidateCount: evaluation.candidateCount,
    candidates: hybrid.map((candidate) => ({
      audioAvailable: candidate.audioAvailable,
      baselineRank: baselineRanks.get(candidate.id) ?? candidate.selectedRank,
      baselineScore: baselineScores.get(candidate.id) ?? 0,
      components: candidate.components,
      fallbackUsed: candidate.fallbackUsed,
      hybridBaseRank: candidate.baseRank,
      hybridScore: candidate.baseScore,
      hybridSelectedRank: candidate.selectedRank,
      moodAvailable: candidate.moodAvailable,
      reasonCodes: candidate.reasonCodes,
      rhythmAvailable: candidate.rhythmAvailable,
      selectorChanged: (baselineRanks.get(candidate.id) ?? candidate.selectedRank) !== candidate.selectedRank,
      selectorScore: candidate.selectorScore,
      trackId: candidate.id,
    })),
    fallbackUsed: evaluation.fallbackUsed,
    hybridTrackIds: evaluation.hybridTrackIds,
    meanAbsoluteRankDisplacement: evaluation.meanAbsoluteRankDisplacement,
    moodCoverageRatio: evaluation.moodCoverageRatio,
    overlapAtK: evaluation.overlapAtK,
    rankingVersion: "hybrid-v0",
    requestedLimit: limit,
    rhythmCoverageRatio: evaluation.rhythmCoverageRatio,
    sameArtistRatio: evaluation.sameArtistRatio,
    selectorChangedCount: evaluation.selectorChangedCount,
    servedBaselineTrackIds: provenance.servedBaselineTrackIds,
    textProfileId: profile.id,
    textProfileVersion: profile.algorithm_version,
    userId: profile.user_id,
  };
}

function mapRecommendation(
  row: EmsCandidateRow & {
    recommendation: {
      score: number;
      scoreComponents: RecommendationScoreComponents;
    };
  },
): EmsRecommendationTrack {
  const reasons = ["taste_match"];
  if (row.recommendation.scoreComponents.freshness >= 0.8) {
    reasons.push("fresh_release");
  }
  return {
    album: row.album ?? "Unknown Album",
    artist: row.artist,
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    artworkUrl: row.artwork_url ?? "",
    durationSeconds: Math.round(row.duration_ms / 1000),
    id: row.id,
    playbackAvailable: true,
    recommendation: {
      rankingVersion: "baseline",
      reasonCodes: reasons,
      score: row.recommendation.score,
      scoreComponents: row.recommendation.scoreComponents,
    },
    tidalTrackId: row.tidal_id,
    title: row.title,
  };
}

function mapHybridRecommendation(
  row: EmsCandidateRow,
  candidate: RecommendationShadowCandidate,
): EmsRecommendationTrack {
  const components: RecommendationScoreComponents = {
    baseScore: candidate.hybridScore,
    catalogPriority: candidate.components.editorial,
    diversity: candidate.selectorScore < candidate.hybridScore ? 0.25 : 1,
    freshness: candidate.components.freshness,
    hybridSimilarity: candidate.components.hybridSimilarity,
    matchConfidence: candidate.components.catalog,
    selectorScore: candidate.selectorScore,
    similarity: candidate.components.hybridSimilarity,
    text: candidate.components.text,
    ...(candidate.components.audio === null ? {} : { audio: candidate.components.audio }),
    ...(candidate.components.mood === null ? {} : { mood: candidate.components.mood }),
    ...(candidate.components.rhythm === null ? {} : { rhythm: candidate.components.rhythm }),
  };
  return {
    album: row.album ?? "Unknown Album",
    artist: row.artist,
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    artworkUrl: row.artwork_url ?? "",
    durationSeconds: Math.round(row.duration_ms / 1000),
    id: row.id,
    playbackAvailable: true,
    recommendation: {
      rankingVersion: "hybrid-v0",
      reasonCodes: candidate.reasonCodes,
      score: candidate.selectorScore,
      scoreComponents: components,
    },
    tidalTrackId: row.tidal_id,
    title: row.title,
  };
}

export async function preparePersonalizedEmsRecommendations(
  auth0Subject: string,
  limit = 12,
  executor?: TransactionExecutor,
): Promise<PreparedPersonalizedRecommendations> {
  const safeLimit = Math.max(1, Math.min(24, Math.trunc(limit)));
  const profileResult = await database(executor).query<ProfileRow>(
    `/* recommendation_profiles */
     SELECT
       p.id,
       p.user_id,
       p.algorithm_version,
       audio_profile.id AS audio_profile_id,
       audio_profile.profile_version::text AS audio_profile_version,
       audio_profile.embedding_model_revision AS audio_model_revision,
       audio_profile.summary_features AS audio_summary_features,
       audio_profile.prediction_features AS audio_prediction_features
     FROM user_taste_profiles AS p
     INNER JOIN app_users AS u ON u.id = p.user_id
     LEFT JOIN LATERAL (
       SELECT audio.*
       FROM user_audio_taste_profiles AS audio
       WHERE audio.user_id = u.id AND audio.status = 'completed'
       ORDER BY audio.completed_at DESC, audio.id DESC
       LIMIT 1
     ) AS audio_profile ON true
     WHERE u.auth0_subject = $1 AND p.status = 'completed'
     ORDER BY p.updated_at DESC, p.id DESC
     LIMIT 1`,
    [auth0Subject],
  );
  const profile = profileResult.rows[0];
  if (!profile) {
    return {
      hybridRecommendations: null,
      recommendations: {
        profileReady: false,
        profileVersion: null,
        rankingVersion: "baseline",
        tracks: [],
      },
      shadow: null,
    };
  }

  const candidateResult = await database(executor).query<EmsCandidateRow>(
    `WITH centroid_similarity AS (
       SELECT
         e.id,
         MAX(CASE WHEN c.cluster_index = 0
           THEN 1 - (embedding.embedding <=> c.embedding) END)::float8 AS similarity_global,
         MAX(CASE WHEN c.cluster_index > 0
           THEN 1 - (embedding.embedding <=> c.embedding) END)::float8 AS similarity_cluster
       FROM ems_tracks AS e
       INNER JOIN ems_track_embeddings AS embedding
         ON embedding.track_id = e.id AND embedding.status = 'completed'
       INNER JOIN user_taste_centroids AS c ON c.profile_id = $1
       WHERE e.status = 'active'
       GROUP BY e.id
     ),
     audio_candidate AS (
       SELECT
         embedding.track_id,
         MAX(CASE WHEN centroid.cluster_index = 0
           THEN 1 - (embedding.embedding <=> centroid.embedding) END)::float8
           AS audio_similarity_global,
         MAX(CASE WHEN centroid.cluster_index > 0
           THEN 1 - (embedding.embedding <=> centroid.embedding) END)::float8
           AS audio_similarity_cluster,
         CASE WHEN jsonb_typeof(feature.dsp_features #> '{rhythm,bpm}') = 'number'
           THEN (feature.dsp_features #>> '{rhythm,bpm}')::float8
           ELSE NULL END AS candidate_bpm,
         prediction_set.predictions AS candidate_predictions
       FROM user_audio_taste_profiles AS audio_profile
       INNER JOIN user_audio_taste_centroids AS centroid
         ON centroid.profile_id = audio_profile.id
       INNER JOIN ems_track_audio_embeddings AS embedding
         ON embedding.model_id = audio_profile.embedding_model_id
        AND embedding.model_revision = audio_profile.embedding_model_revision
        AND embedding.dimensions = audio_profile.dimensions
        AND embedding.normalization = 'l2'
       INNER JOIN ems_track_audio_jobs AS job
         ON job.track_id = embedding.track_id
        AND job.preview_hash = embedding.preview_hash
        AND job.feature_version = audio_profile.feature_version
        AND job.status = 'completed'
       INNER JOIN ems_track_audio_features AS feature
         ON feature.track_id = job.track_id
        AND feature.preview_hash = job.preview_hash
        AND feature.feature_version = job.feature_version
       LEFT JOIN LATERAL (
         SELECT jsonb_object_agg(
           prediction.label,
           prediction.probability
           ORDER BY prediction.label
         ) AS predictions
         FROM ems_track_audio_predictions AS prediction
         WHERE prediction.track_id = job.track_id
           AND prediction.preview_hash = job.preview_hash
           AND prediction.model_id LIKE 'essentia/msd-musicnn/%'
           AND prediction.model_revision = audio_profile.prediction_model_revision
           AND prediction.vocabulary_version = audio_profile.prediction_vocabulary_version
           AND prediction.label = ANY($5::text[])
         HAVING count(*) = cardinality($5::text[])
            AND count(DISTINCT prediction.label) = cardinality($5::text[])
       ) AS prediction_set ON true
       WHERE audio_profile.id = $4::uuid
         AND audio_profile.status = 'completed'
       GROUP BY embedding.track_id, feature.dsp_features, prediction_set.predictions
     ),
     candidate_source AS (
       SELECT
         e.id,
         e.tidal_id,
         e.title,
         e.artist,
         e.album,
         e.duration_ms,
         e.artwork_url,
         e.match_confidence,
         e.catalog_priority,
         (e.status = 'active') AS is_active,
         availability.playable AS is_playable,
         CASE
           WHEN COALESCE(e.mb_first_release_date, e.tidal_album_release_date, e.release_date) IS NULL
             THEN 0::float8
           ELSE LEAST(1, GREATEST(
             0,
             1 - EXTRACT(EPOCH FROM (
               now() - COALESCE(e.mb_first_release_date, e.tidal_album_release_date, e.release_date)::timestamptz
             )) / (365 * 86400)
           ))::float8
         END AS freshness,
         cs.similarity_global,
         cs.similarity_cluster,
         CASE WHEN cs.similarity_cluster IS NULL
           THEN cs.similarity_global
           ELSE 0.3 * cs.similarity_global + 0.7 * cs.similarity_cluster
         END AS text_similarity,
         audio.audio_similarity_global,
         audio.audio_similarity_cluster,
         audio.candidate_bpm,
         audio.candidate_predictions,
         candidate_audio_job.status AS audio_job_status,
         candidate_audio_job.last_error_code AS audio_error_code
       FROM ems_tracks AS e
       INNER JOIN centroid_similarity AS cs ON cs.id = e.id
       LEFT JOIN audio_candidate AS audio ON audio.track_id = e.id
       LEFT JOIN ems_track_audio_jobs AS candidate_audio_job
         ON candidate_audio_job.track_id = e.id
       JOIN LATERAL (
         SELECT a.playable
         FROM ems_availability_events AS a
         WHERE a.track_id = e.id AND a.region = 'KR' AND a.capability = 'STREAM'
         ORDER BY a.observed_at DESC, a.id DESC
         LIMIT 1
       ) AS availability ON availability.playable = true
       WHERE e.status = 'active'
         AND NOT EXISTS (
           SELECT 1
           FROM music_tracks AS owned
           INNER JOIN user_playlist_tracks AS playlist_track ON playlist_track.track_id = owned.id
           INNER JOIN user_playlists AS playlist
             ON playlist.id = playlist_track.playlist_id
            AND playlist.user_id = $2
            AND playlist.selected = true
           WHERE owned.user_id = $2 AND owned.tidal_track_id = e.tidal_id
         )
         AND NOT EXISTS (
           SELECT 1
           FROM user_recommendation_decisions AS decision
           WHERE decision.user_id = $2
             AND decision.source_track_id = e.id
             AND decision.decision IN ('accept', 'reject')
         )
         AND NOT EXISTS (
           SELECT 1
           FROM user_recommendation_exposures AS exposure
           WHERE exposure.user_id = $2
             AND exposure.track_id = e.id
         )
     ),
     classified_candidate AS (
       SELECT
         candidate_source.*,
         COALESCE(
           audio_job_status = 'failed' AND audio_error_code = ANY($6::text[]),
           false
         ) AS audio_discarded
       FROM candidate_source
     ),
     ranked_candidate AS (
       SELECT
         classified_candidate.*,
         (row_number() OVER (
           ORDER BY text_similarity DESC, id ASC
         ))::integer AS source_rank,
         (count(*) FILTER (WHERE NOT audio_discarded) OVER (
           ORDER BY text_similarity DESC, id ASC
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ))::integer AS eligible_source_rank
       FROM classified_candidate
     )
     SELECT *
     FROM ranked_candidate
     WHERE source_rank <= $3
        OR (NOT audio_discarded AND eligible_source_rank <= $3)
     ORDER BY source_rank`,
    [
      profile.id,
      profile.user_id,
      Math.min(120, safeLimit * 5),
      profile.audio_profile_id,
      [...AUDIO_PREDICTION_LABELS],
      [...TERMINAL_AUDIO_CANDIDATE_ERROR_CODES],
    ],
  );
  const candidatePoolSize = Math.min(120, safeLimit * 5);
  const filteredRows = filterRankingCandidates(candidateResult.rows.map((row, index) => ({
    ...row,
    audioDiscarded: row.audio_discarded
      ?? isTerminalAudioCandidateFailure(row.audio_job_status, row.audio_error_code),
    isActive: row.is_active ?? true,
    isPlayable: row.is_playable ?? true,
    sourceRank: row.source_rank ?? index + 1,
  })), new Set());
  const baselineRows = filteredRows.filter((row) => row.sourceRank <= candidatePoolSize);
  const hybridRows = filteredRows
    .filter((row) => !row.audioDiscarded)
    .slice(0, candidatePoolSize);
  const baseline = rankEmsCandidates(baselineRows, baselineRows.length);
  const hybridBaseline = rankEmsCandidates(hybridRows, hybridRows.length);
  const recommendations = {
    profileReady: true,
    profileVersion: profile.algorithm_version,
    rankingVersion: "baseline" as const,
    tracks: baseline.slice(0, safeLimit).map(mapRecommendation),
  };
  const shadow = hybridRows.length === 0
    ? null
    : buildShadowPayload(profile, hybridRows, hybridBaseline, safeLimit, {
        audioDiscardedCandidates: baselineRows.flatMap((row) =>
          row.audioDiscarded && row.audio_error_code
            ? [{ errorCode: row.audio_error_code, trackId: row.id }]
            : []),
        backfilledTrackIds: hybridRows
          .filter((row) => row.sourceRank > candidatePoolSize)
          .map((row) => row.id),
        servedBaselineTrackIds: baseline.slice(0, safeLimit).map((row) => row.id),
      });
  const rowsById = new Map(hybridRows.map((row) => [row.id, row]));
  const shadowCandidatesById = new Map(
    shadow?.candidates.map((candidate) => [candidate.trackId, candidate]) ?? [],
  );
  const hybridTracks = shadow?.hybridTrackIds.flatMap((trackId) => {
    const row = rowsById.get(trackId);
    const candidate = shadowCandidatesById.get(trackId);
    return row && candidate ? [mapHybridRecommendation(row, candidate)] : [];
  }) ?? [];
  return {
    hybridRecommendations: shadow
      ? {
          profileReady: true,
          profileVersion: profile.algorithm_version,
          rankingVersion: "hybrid-v0",
          tracks: hybridTracks,
        }
      : null,
    recommendations,
    shadow,
  };
}

export function selectPreparedPersonalizedRecommendations(
  auth0Subject: string,
  prepared: PreparedPersonalizedRecommendations,
  environment: ServingEnvironment = process.env,
): SelectedPersonalizedRecommendations {
  const serving = decideRecommendationServing({
    audioCoverageRatio: prepared.shadow?.audioCoverageRatio ?? 0,
    audioProfileAvailable: Boolean(prepared.shadow?.audioProfileId),
    auth0Subject,
    environment,
    moodCoverageRatio: prepared.shadow?.moodCoverageRatio ?? 0,
    rhythmCoverageRatio: prepared.shadow?.rhythmCoverageRatio ?? 0,
  });
  return {
    recommendations: serving.servedRankingVersion === "hybrid-v0"
      && prepared.hybridRecommendations
      ? prepared.hybridRecommendations
      : prepared.recommendations,
    serving: serving.servedRankingVersion === "hybrid-v0"
      && !prepared.hybridRecommendations
      ? {
          ...serving,
          fallbackReason: "audio_profile_unavailable",
          servedRankingVersion: "baseline",
        }
      : serving,
  };
}

export async function listPersonalizedEmsRecommendations(
  auth0Subject: string,
  limit = 12,
  executor?: TransactionExecutor,
): Promise<PersonalizedRecommendations> {
  const prepared = await preparePersonalizedEmsRecommendations(
    auth0Subject,
    limit,
    executor,
  );
  return selectPreparedPersonalizedRecommendations(auth0Subject, prepared).recommendations;
}

export async function recordRecommendationShadow(
  auth0Subject: string,
  shadow: RecommendationShadowPayload,
  serving: RecommendationServingDecision,
  executor?: TransactionExecutor,
): Promise<void> {
  const transaction = (executor
    ?? await getDatabasePool().connect()) as ReleasableExecutor;
  try {
    await transaction.query("BEGIN");
    const runResult = await transaction.query<{ id: string }>(
      `INSERT INTO user_recommendation_shadow_runs (
         user_id, text_profile_id, text_profile_version,
         audio_profile_id, audio_profile_version, audio_model_revision,
         ranking_version, requested_limit, candidate_count,
         baseline_track_ids, hybrid_track_ids, overlap_at_k,
         mean_abs_rank_displacement, same_artist_ratio,
         selector_changed_count, audio_coverage_ratio,
         mood_coverage_ratio, rhythm_coverage_ratio, fallback_used,
         requested_ranking_version, served_ranking_version,
         minimum_audio_coverage, serving_fallback_reason,
         served_baseline_track_ids, audio_discarded_track_ids,
         audio_discarded_error_codes, backfilled_track_ids
       )
       SELECT
         user_row.id, $3::uuid, $4,
         $5::uuid, $6::uuid, $7,
         $8, $9, $10,
         $11::uuid[], $12::uuid[], $13,
         $14, $15, $16, $17, $18, $19, $20,
         $21, $22, $23, $24,
         $25::uuid[], $26::uuid[], $27::text[], $28::uuid[]
       FROM app_users AS user_row
       WHERE user_row.auth0_subject = $1 AND user_row.id = $2::uuid
       RETURNING id`,
      [
        auth0Subject,
        shadow.userId,
        shadow.textProfileId,
        shadow.textProfileVersion,
        shadow.audioProfileId,
        shadow.audioProfileVersion,
        shadow.audioModelRevision,
        shadow.rankingVersion,
        shadow.requestedLimit,
        shadow.candidateCount,
        shadow.baselineTrackIds,
        shadow.hybridTrackIds,
        shadow.overlapAtK,
        shadow.meanAbsoluteRankDisplacement,
        shadow.sameArtistRatio,
        shadow.selectorChangedCount,
        shadow.audioCoverageRatio,
        shadow.moodCoverageRatio,
        shadow.rhythmCoverageRatio,
        shadow.fallbackUsed,
        serving.requestedRankingVersion,
        serving.servedRankingVersion,
        serving.minimumAudioCoverage,
        serving.fallbackReason,
        shadow.servedBaselineTrackIds,
        shadow.audioDiscardedCandidates.map((candidate) => candidate.trackId),
        shadow.audioDiscardedCandidates.map((candidate) => candidate.errorCode),
        shadow.backfilledTrackIds,
      ],
    );
    const runId = runResult.rows[0]?.id;
    if (!runId) throw new Error("recommendation_shadow_user_not_found");

    for (const candidate of shadow.candidates) {
      await transaction.query(
        `INSERT INTO user_recommendation_shadow_candidates (
           run_id, track_id, baseline_rank,
           hybrid_base_rank, hybrid_selected_rank,
           baseline_score, hybrid_score, selector_score,
           selector_changed, audio_available, mood_available,
           rhythm_available, fallback_used, components, reason_codes
         ) VALUES (
           $1, $2::uuid, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb
         )`,
        [
          runId,
          candidate.trackId,
          candidate.baselineRank,
          candidate.hybridBaseRank,
          candidate.hybridSelectedRank,
          candidate.baselineScore,
          candidate.hybridScore,
          candidate.selectorScore,
          candidate.selectorChanged,
          candidate.audioAvailable,
          candidate.moodAvailable,
          candidate.rhythmAvailable,
          candidate.fallbackUsed,
          JSON.stringify(candidate.components),
          JSON.stringify(candidate.reasonCodes),
        ],
      );
    }
    await transaction.query(
      `SELECT prune_recommendation_shadow_runs($1::uuid, $2, $3) AS deleted_runs`,
      [
        shadow.userId,
        RECOMMENDATION_SHADOW_RETENTION_DAYS,
        RECOMMENDATION_SHADOW_MAX_RUNS_PER_USER,
      ],
    );
    await transaction.query("COMMIT");
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    if (!executor) transaction.release?.();
  }
}

export async function saveRecommendationDecision(
  auth0Subject: string,
  input: RecommendationDecision,
  executor?: TransactionExecutor,
): Promise<void> {
  const result = await database(executor).query<{ id: string }>(
    `INSERT INTO user_recommendation_decisions
      (user_id, source_track_id, profile_version, ranking_version,
       decision, reason_codes, score_components)
     SELECT u.id, $2, $3, $4, $5, $6::jsonb, $7::jsonb
     FROM app_users AS u
     WHERE u.auth0_subject = $1
     RETURNING id`,
    [
      auth0Subject,
      input.sourceTrackId,
      input.profileVersion,
      input.rankingVersion,
      input.decision,
      JSON.stringify(input.reasonCodes),
      JSON.stringify(input.scoreComponents),
    ],
  );
  if (!result.rows[0]) throw new Error("recommendation_user_not_found");
}

export async function getAcceptedRecommendationTracks(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<Track[]> {
  const result = await database(executor).query<{
    id: string; tidal_id: string; title: string; artist: string;
    album: string | null; artwork_url: string | null;
    duration_ms: number; playable: boolean;
  }>(
    `WITH accepted AS (
       SELECT decision.user_id, decision.source_track_id,
         MAX(decision.created_at) AS accepted_at
       FROM user_recommendation_decisions AS decision
       INNER JOIN app_users AS u ON u.id = decision.user_id
       WHERE u.auth0_subject = $1 AND decision.decision = 'accept'
       GROUP BY decision.user_id, decision.source_track_id
     )
     SELECT e.id, e.tidal_id, e.title, e.artist, e.album,
       e.artwork_url, e.duration_ms,
       COALESCE(availability.playable, false) AS playable
     FROM accepted
     INNER JOIN ems_tracks AS e ON e.id = accepted.source_track_id
     LEFT JOIN LATERAL (
       SELECT event.playable FROM ems_availability_events AS event
       WHERE event.track_id = e.id AND event.region = 'KR'
         AND event.capability = 'STREAM'
       ORDER BY event.observed_at DESC, event.id DESC LIMIT 1
     ) AS availability ON true
     WHERE e.status = 'active' AND NOT EXISTS (
       SELECT 1 FROM user_recommendation_decisions AS rejected
       WHERE rejected.user_id = accepted.user_id
         AND rejected.source_track_id = e.id AND rejected.decision = 'reject'
     )
     ORDER BY accepted.accepted_at DESC, e.id`,
    [auth0Subject],
  );
  return result.rows.map((row) => ({
    id: row.id,
    tidalTrackId: row.tidal_id,
    title: row.title,
    artist: row.artist,
    album: row.album ?? "Unknown Album",
    artworkUrl: row.artwork_url ?? "",
    artworkClass: "from-teal-700 via-violet-700 to-slate-900",
    durationSeconds: Math.round(row.duration_ms / 1000),
    playbackAvailable: row.playable,
  }));
}
