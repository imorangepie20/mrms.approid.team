from __future__ import annotations

import base64
from dataclasses import dataclass
from hashlib import sha256
import json
import math
import re
from typing import Any

import httpx


FEATURE_VERSION = "essentia-dsp-v1"
EMBEDDING_DIMENSIONS = 2304
MAX_PREVIEW_BYTES = 4 * 1024 * 1024
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class AudioJobError(RuntimeError):
    def __init__(
        self,
        code: str,
        *,
        retryable: bool,
        retry_after_seconds: int | None = None,
        stop_run: bool = False,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds
        self.stop_run = stop_run


@dataclass(frozen=True)
class AudioJob:
    track_id: str
    tidal_id: str


@dataclass(frozen=True)
class PreviewPayload:
    content: bytes
    content_type: str
    preview_hash: str


def _string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _manifest(value: Any) -> dict[str, Any]:
    if not isinstance(value, str) or not value.strip():
        raise AudioJobError("preview_manifest_invalid", retryable=True)
    if value.lower().startswith("https://"):
        return {"directUrl": value}
    try:
        decoded = base64.b64decode(value, validate=True).decode("utf-8")
        parsed = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AudioJobError("preview_manifest_invalid", retryable=True) from error
    if not isinstance(parsed, dict):
        raise AudioJobError("preview_manifest_invalid", retryable=True)
    return parsed


def _stream_url(manifest: dict[str, Any]) -> str:
    urls = manifest.get("urls")
    first_url = next((item for item in urls if isinstance(item, str)), None) if isinstance(urls, list) else None
    value = _string(manifest.get("directUrl")) or _string(manifest.get("url")) or _string(first_url)
    if value is None or not value.lower().startswith("https://"):
        raise AudioJobError("preview_url_invalid", retryable=True)
    return value


class TidalPreviewClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        country_code: str = "KR",
        token_url: str = "https://auth.tidal.com/v1/oauth2/token",
        api_base_url: str = "https://api.tidal.com/v1",
        http_client: httpx.Client | None = None,
        request_budget: int = 3,
        max_preview_bytes: int = MAX_PREVIEW_BYTES,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.country_code = country_code.upper()
        self.token_url = token_url
        self.api_base_url = api_base_url.rstrip("/")
        self.http_client = http_client or httpx.Client(timeout=30)
        self.request_budget = max(1, int(request_budget))
        self.max_preview_bytes = max(1, min(MAX_PREVIEW_BYTES, int(max_preview_bytes)))
        self.used_requests = 0
        self._token: str | None = None

    def _reserve_request(self) -> None:
        if self.used_requests >= self.request_budget:
            raise AudioJobError("request_budget_exhausted", retryable=True, stop_run=True)
        self.used_requests += 1

    def _get_token(self) -> str:
        if self._token is not None:
            return self._token
        self._reserve_request()
        encoded = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        try:
            response = self.http_client.post(
                self.token_url,
                headers={
                    "Authorization": f"Basic {encoded}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )
        except httpx.HTTPError as error:
            raise AudioJobError("token_network", retryable=True) from error
        if response.status_code == 429:
            raise AudioJobError("token_rate_limited", retryable=True, stop_run=True)
        if response.status_code >= 500:
            raise AudioJobError("token_upstream_5xx", retryable=True)
        if response.status_code >= 400:
            raise AudioJobError("token_rejected", retryable=False)
        try:
            token = response.json().get("access_token")
        except (ValueError, AttributeError) as error:
            raise AudioJobError("token_response_invalid", retryable=True) from error
        if not isinstance(token, str) or not token:
            raise AudioJobError("token_response_invalid", retryable=True)
        self._token = token
        return token

    def download(self, tidal_id: str) -> PreviewPayload:
        if not re.fullmatch(r"\d+", tidal_id):
            raise AudioJobError("tidal_id_invalid", retryable=False)
        token = self._get_token()
        self._reserve_request()
        try:
            response = self.http_client.get(
                f"{self.api_base_url}/tracks/{tidal_id}/playbackinfo",
                params={
                    "audioquality": "LOW",
                    "playbackmode": "STREAM",
                    "assetpresentation": "PREVIEW",
                    "countryCode": self.country_code,
                },
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
        except httpx.HTTPError as error:
            raise AudioJobError("preview_info_network", retryable=True) from error
        if response.status_code == 429:
            raise AudioJobError("preview_info_rate_limited", retryable=True, stop_run=True)
        if response.status_code >= 500:
            raise AudioJobError("preview_info_upstream_5xx", retryable=True)
        if response.status_code in {404, 410}:
            raise AudioJobError("preview_unavailable", retryable=False)
        if response.status_code >= 400:
            raise AudioJobError("preview_info_rejected", retryable=False)
        try:
            body = response.json()
            manifest = _manifest(body.get("manifest"))
        except (ValueError, AttributeError) as error:
            raise AudioJobError("preview_info_invalid", retryable=True) from error
        presentation = _string(body.get("assetPresentation")) or _string(manifest.get("assetPresentation"))
        if presentation != "PREVIEW":
            raise AudioJobError("preview_presentation_invalid", retryable=False)
        stream_url = _stream_url(manifest)
        mime_type = (_string(manifest.get("mimeType")) or "").lower()
        encryption = (_string(manifest.get("encryptionType")) or "NONE").upper()
        if (
            encryption != "NONE"
            or "dash" in mime_type
            or "mpegurl" in mime_type
            or re.search(r"\.(?:mpd|m3u8)(?:\?|$)", stream_url, re.IGNORECASE)
        ):
            raise AudioJobError("preview_format_unsupported", retryable=False)

        self._reserve_request()
        try:
            with self.http_client.stream("GET", stream_url, headers={"Accept": "audio/*"}) as stream:
                if stream.status_code == 429:
                    raise AudioJobError("preview_download_rate_limited", retryable=True, stop_run=True)
                if stream.status_code >= 500:
                    raise AudioJobError("preview_download_upstream_5xx", retryable=True)
                if stream.status_code >= 400:
                    raise AudioJobError("preview_download_failed", retryable=False)
                content_type = stream.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if not (content_type.startswith("audio/") or content_type == "application/octet-stream"):
                    raise AudioJobError("preview_content_type_unsupported", retryable=False)
                content_length = stream.headers.get("content-length")
                if content_length is not None:
                    try:
                        if int(content_length) > self.max_preview_bytes:
                            raise AudioJobError("preview_too_large", retryable=False)
                    except ValueError as error:
                        raise AudioJobError("preview_content_length_invalid", retryable=True) from error
                chunks = bytearray()
                for chunk in stream.iter_bytes():
                    chunks.extend(chunk)
                    if len(chunks) > self.max_preview_bytes:
                        raise AudioJobError("preview_too_large", retryable=False)
        except AudioJobError:
            raise
        except httpx.HTTPError as error:
            raise AudioJobError("preview_download_network", retryable=True) from error
        if not chunks:
            raise AudioJobError("preview_empty", retryable=False)
        content = bytes(chunks)
        return PreviewPayload(content, content_type, sha256(content).hexdigest())


def validate_analysis(payload: Any, expected_hash: str, feature_version: str = FEATURE_VERSION) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise AudioJobError("analysis_response_invalid", retryable=True)
    if payload.get("previewHash") != expected_hash or not SHA256_PATTERN.fullmatch(expected_hash):
        raise AudioJobError("analysis_hash_mismatch", retryable=True)
    if payload.get("featureVersion") != feature_version or payload.get("analysisStage") != "complete":
        raise AudioJobError("analysis_version_invalid", retryable=False)
    duration = payload.get("durationSeconds")
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 0 < duration <= 30.001:
        raise AudioJobError("analysis_duration_invalid", retryable=False)
    if payload.get("sampleRate") != 16000 or payload.get("channelCount") != 1:
        raise AudioJobError("analysis_audio_contract_invalid", retryable=False)
    features = payload.get("features")
    if not isinstance(features, dict) or not all(key in features for key in ("whole", "segments", "summary", "dsp")):
        raise AudioJobError("analysis_features_invalid", retryable=True)
    if not isinstance(features["segments"], list) or not features["segments"]:
        raise AudioJobError("analysis_features_invalid", retryable=True)
    summary = features["summary"]
    if not isinstance(summary, dict) or summary.get("segmentCount") != len(features["segments"]):
        raise AudioJobError("analysis_features_invalid", retryable=True)
    coverage = summary.get("coverageRatio")
    if not isinstance(coverage, (int, float)) or not 0 < coverage <= 1:
        raise AudioJobError("analysis_features_invalid", retryable=True)
    embedding = payload.get("embedding")
    if not isinstance(embedding, dict):
        raise AudioJobError("analysis_embedding_invalid", retryable=True)
    values = embedding.get("values")
    if (
        not isinstance(embedding.get("modelId"), str)
        or not embedding["modelId"]
        or not isinstance(embedding.get("modelRevision"), str)
        or not embedding["modelRevision"]
        or
        embedding.get("dimensions") != EMBEDDING_DIMENSIONS
        or embedding.get("normalization") != "l2"
        or not isinstance(values, list)
        or len(values) != EMBEDDING_DIMENSIONS
        or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in values)
    ):
        raise AudioJobError("analysis_embedding_invalid", retryable=True)
    norm = math.sqrt(math.fsum(float(value) * float(value) for value in values))
    if not math.isclose(norm, 1.0, rel_tol=0.0, abs_tol=1e-4):
        raise AudioJobError("analysis_embedding_invalid", retryable=True)
    predictions = payload.get("predictions")
    if not isinstance(predictions, list) or not predictions:
        raise AudioJobError("analysis_predictions_invalid", retryable=True)
    identities: set[tuple[str, str, str]] = set()
    for prediction in predictions:
        if not isinstance(prediction, dict):
            raise AudioJobError("analysis_predictions_invalid", retryable=True)
        probability = prediction.get("probability")
        identity = (prediction.get("modelId"), prediction.get("modelRevision"), prediction.get("label"))
        if (
            not all(isinstance(item, str) and item for item in identity)
            or identity in identities
            or not isinstance(prediction.get("vocabularyVersion"), str)
            or not isinstance(probability, (int, float))
            or not math.isfinite(probability)
            or not 0 <= probability <= 1
        ):
            raise AudioJobError("analysis_predictions_invalid", retryable=True)
        identities.add(identity)
    return payload


class AudioAnalysisClient:
    def __init__(self, base_url: str, *, http_client: httpx.Client | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.http_client = http_client or httpx.Client(timeout=90)

    def analyze(self, preview: PreviewPayload, feature_version: str = FEATURE_VERSION) -> dict[str, Any]:
        try:
            response = self.http_client.post(
                f"{self.base_url}/v1/audio-analysis",
                content=preview.content,
                headers={
                    "Content-Type": preview.content_type,
                    "X-Preview-Sha256": preview.preview_hash,
                    "X-Feature-Version": feature_version,
                },
            )
        except httpx.HTTPError as error:
            raise AudioJobError("analysis_network", retryable=True) from error
        if response.status_code >= 500:
            raise AudioJobError("analysis_unavailable", retryable=True)
        if response.status_code >= 400:
            raise AudioJobError("analysis_rejected", retryable=False)
        try:
            payload = response.json()
        except ValueError as error:
            raise AudioJobError("analysis_response_invalid", retryable=True) from error
        return validate_analysis(payload, preview.preview_hash, feature_version)


def stage_audio_jobs(connection: Any, *, limit: int = 16, feature_version: str = FEATURE_VERSION) -> int:
    safe_limit = max(1, min(100, int(limit)))
    result = connection.execute(
        """
        WITH candidates AS (
          SELECT track.id
            FROM ems_tracks AS track
            LEFT JOIN ems_track_audio_jobs AS job ON job.track_id = track.id
           WHERE track.status = 'active'
             AND track.tidal_id ~ '^[0-9]+$'
             AND (job.track_id IS NULL OR job.feature_version <> %s)
           ORDER BY track.updated_at DESC, track.id
           LIMIT %s
        )
        INSERT INTO ems_track_audio_jobs (track_id, feature_version, status, updated_at)
        SELECT id, %s, 'pending', now() FROM candidates
        ON CONFLICT (track_id) DO UPDATE SET
          feature_version = EXCLUDED.feature_version,
          preview_hash = NULL,
          status = 'pending',
          attempt_count = 0,
          claimed_at = NULL,
          lease_expires_at = NULL,
          next_attempt_at = NULL,
          last_error_code = NULL,
          last_error_at = NULL,
          completed_at = NULL,
          updated_at = now()
        """,
        (feature_version, safe_limit, feature_version),
    )
    return max(0, int(result.rowcount))


def claim_audio_jobs(connection: Any, *, limit: int = 1, lease_seconds: int = 300) -> list[AudioJob]:
    safe_limit = max(1, min(8, int(limit)))
    safe_lease = max(60, min(1800, int(lease_seconds)))
    rows = connection.execute(
        """
        WITH claimed AS (
          SELECT job.track_id
            FROM ems_track_audio_jobs AS job
           WHERE (
             (job.status IN ('pending', 'retryable') AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now()))
             OR (job.status = 'running' AND job.lease_expires_at <= now())
           )
           ORDER BY job.updated_at, job.track_id
           FOR UPDATE SKIP LOCKED
           LIMIT %s
        )
        UPDATE ems_track_audio_jobs AS job
           SET status = 'running',
               attempt_count = job.attempt_count + 1,
               claimed_at = now(),
               lease_expires_at = now() + (%s * interval '1 second'),
               next_attempt_at = NULL,
               updated_at = now()
          FROM claimed, ems_tracks AS track
         WHERE job.track_id = claimed.track_id
           AND track.id = job.track_id
        RETURNING job.track_id::text, track.tidal_id
        """,
        (safe_limit, safe_lease),
    ).fetchall()
    return [AudioJob(str(row["track_id"]), str(row["tidal_id"])) for row in rows]


def release_audio_claims(connection: Any, track_ids: list[str]) -> int:
    if not track_ids:
        return 0
    result = connection.execute(
        """
        UPDATE ems_track_audio_jobs
           SET status = 'retryable', claimed_at = NULL, lease_expires_at = NULL,
               next_attempt_at = now(), updated_at = now()
         WHERE track_id = ANY(%s::uuid[]) AND status = 'running'
        """,
        (track_ids,),
    )
    return max(0, int(result.rowcount))


def reuse_completed_analysis(
    connection: Any,
    track_id: str,
    preview_hash: str,
    feature_version: str = FEATURE_VERSION,
) -> bool:
    source = connection.execute(
        """
        SELECT feature.track_id::text AS track_id
          FROM ems_track_audio_features AS feature
          JOIN ems_track_audio_jobs AS job
            ON job.track_id = feature.track_id AND job.status = 'completed'
         WHERE feature.preview_hash = %s AND feature.feature_version = %s
           AND EXISTS (
             SELECT 1 FROM ems_track_audio_embeddings AS embedding
              WHERE embedding.track_id = feature.track_id AND embedding.preview_hash = feature.preview_hash
           )
           AND EXISTS (
             SELECT 1 FROM ems_track_audio_predictions AS prediction
              WHERE prediction.track_id = feature.track_id AND prediction.preview_hash = feature.preview_hash
           )
         ORDER BY feature.created_at
         LIMIT 1
        """,
        (preview_hash, feature_version),
    ).fetchone()
    if source is None:
        return False
    source_id = str(source["track_id"])
    connection.execute(
        """
        INSERT INTO ems_track_audio_features
          (track_id, feature_version, preview_hash, duration_seconds, sample_rate, channel_count,
           segment_count, coverage_ratio, whole_features, segment_features, summary_features, dsp_features)
        SELECT %s, feature_version, preview_hash, duration_seconds, sample_rate, channel_count,
               segment_count, coverage_ratio, whole_features, segment_features, summary_features, dsp_features
          FROM ems_track_audio_features
         WHERE track_id = %s AND feature_version = %s AND preview_hash = %s
        ON CONFLICT DO NOTHING
        """,
        (track_id, source_id, feature_version, preview_hash),
    )
    connection.execute(
        """
        INSERT INTO ems_track_audio_embeddings
          (track_id, model_id, model_revision, preview_hash, dimensions, normalization, embedding)
        SELECT %s, model_id, model_revision, preview_hash, dimensions, normalization, embedding
          FROM ems_track_audio_embeddings
         WHERE track_id = %s AND preview_hash = %s
        ON CONFLICT DO NOTHING
        """,
        (track_id, source_id, preview_hash),
    )
    connection.execute(
        """
        INSERT INTO ems_track_audio_predictions
          (track_id, model_id, model_revision, label, preview_hash, probability, vocabulary_version)
        SELECT %s, model_id, model_revision, label, preview_hash, probability, vocabulary_version
          FROM ems_track_audio_predictions
         WHERE track_id = %s AND preview_hash = %s
        ON CONFLICT DO NOTHING
        """,
        (track_id, source_id, preview_hash),
    )
    connection.execute(
        """
        UPDATE ems_track_audio_jobs
           SET status = 'completed', preview_hash = %s, claimed_at = NULL, lease_expires_at = NULL,
               next_attempt_at = NULL, last_error_code = NULL, last_error_at = NULL,
               completed_at = now(), updated_at = now()
         WHERE track_id = %s AND status = 'running'
        """,
        (preview_hash, track_id),
    )
    return True


def persist_audio_analysis(connection: Any, track_id: str, payload: dict[str, Any]) -> None:
    preview_hash = payload["previewHash"]
    feature_version = payload["featureVersion"]
    features = payload["features"]
    summary = features["summary"]
    embedding = payload["embedding"]
    connection.execute(
        """
        INSERT INTO ems_track_audio_features
          (track_id, feature_version, preview_hash, duration_seconds, sample_rate, channel_count,
           segment_count, coverage_ratio, whole_features, segment_features, summary_features, dsp_features)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb)
        ON CONFLICT (track_id, feature_version, preview_hash) DO UPDATE SET
          duration_seconds = EXCLUDED.duration_seconds, sample_rate = EXCLUDED.sample_rate,
          channel_count = EXCLUDED.channel_count, segment_count = EXCLUDED.segment_count,
          coverage_ratio = EXCLUDED.coverage_ratio, whole_features = EXCLUDED.whole_features,
          segment_features = EXCLUDED.segment_features, summary_features = EXCLUDED.summary_features,
          dsp_features = EXCLUDED.dsp_features
        """,
        (
            track_id, feature_version, preview_hash, payload["durationSeconds"], payload["sampleRate"],
            payload["channelCount"], summary["segmentCount"], summary["coverageRatio"],
            json.dumps(features["whole"]), json.dumps(features["segments"]),
            json.dumps(summary), json.dumps(features["dsp"]),
        ),
    )
    connection.execute(
        """
        INSERT INTO ems_track_audio_embeddings
          (track_id, model_id, model_revision, preview_hash, dimensions, normalization, embedding)
        VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
        ON CONFLICT (track_id, model_id, model_revision, preview_hash) DO UPDATE SET
          dimensions = EXCLUDED.dimensions, normalization = EXCLUDED.normalization, embedding = EXCLUDED.embedding
        """,
        (
            track_id, embedding["modelId"], embedding["modelRevision"], preview_hash,
            embedding["dimensions"], embedding["normalization"], str(embedding["values"]),
        ),
    )
    connection.execute(
        "DELETE FROM ems_track_audio_predictions WHERE track_id = %s AND preview_hash = %s",
        (track_id, preview_hash),
    )
    for prediction in payload["predictions"]:
        connection.execute(
            """
            INSERT INTO ems_track_audio_predictions
              (track_id, model_id, model_revision, label, preview_hash, probability, vocabulary_version)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                track_id, prediction["modelId"], prediction["modelRevision"], prediction["label"],
                preview_hash, prediction["probability"], prediction["vocabularyVersion"],
            ),
        )
    connection.execute(
        """
        UPDATE ems_track_audio_jobs
           SET status = 'completed', preview_hash = %s, claimed_at = NULL, lease_expires_at = NULL,
               next_attempt_at = NULL, last_error_code = NULL, last_error_at = NULL,
               completed_at = now(), updated_at = now()
         WHERE track_id = %s AND status = 'running'
        """,
        (preview_hash, track_id),
    )


def mark_audio_error(connection: Any, track_id: str, error: AudioJobError, *, max_attempts: int = 5) -> str:
    retry_after = error.retry_after_seconds if error.retry_after_seconds is not None else 60
    row = connection.execute(
        """
        UPDATE ems_track_audio_jobs
           SET status = CASE WHEN %s AND attempt_count < %s THEN 'retryable' ELSE 'failed' END,
               claimed_at = NULL,
               lease_expires_at = NULL,
               next_attempt_at = CASE WHEN %s AND attempt_count < %s
                 THEN now() + (LEAST(21600, %s * power(2, GREATEST(0, attempt_count - 1))) * interval '1 second')
                 ELSE NULL END,
               last_error_code = %s,
               last_error_at = now(),
               updated_at = now()
         WHERE track_id = %s AND status = 'running'
        RETURNING status
        """,
        (error.retryable, max_attempts, error.retryable, max_attempts, retry_after, error.code, track_id),
    ).fetchone()
    return str(row["status"]) if row is not None else "unchanged"


def run_audio_worker(
    connection: Any,
    preview_client: TidalPreviewClient,
    analysis_client: AudioAnalysisClient,
    *,
    batch_size: int = 1,
    max_batches: int = 1,
    max_attempts: int = 5,
) -> dict[str, int]:
    safe_batches = max(1, min(100, int(max_batches)))
    counts = {"claimed": 0, "analyzed": 0, "reused": 0, "retryable": 0, "failed": 0, "released": 0}
    for _ in range(safe_batches):
        with connection.transaction():
            jobs = claim_audio_jobs(connection, limit=batch_size)
        if not jobs:
            break
        counts["claimed"] += len(jobs)
        remaining = list(jobs)
        for job in jobs:
            remaining.pop(0)
            stop_run = False
            try:
                preview = preview_client.download(job.tidal_id)
                with connection.transaction():
                    reused = reuse_completed_analysis(connection, job.track_id, preview.preview_hash)
                if reused:
                    counts["reused"] += 1
                    continue
                payload = analysis_client.analyze(preview)
                with connection.transaction():
                    persist_audio_analysis(connection, job.track_id, payload)
                counts["analyzed"] += 1
            except AudioJobError as error:
                with connection.transaction():
                    status = mark_audio_error(connection, job.track_id, error, max_attempts=max_attempts)
                if status in counts:
                    counts[status] += 1
                stop_run = error.stop_run
            except (KeyboardInterrupt, SystemExit):
                with connection.transaction():
                    counts["released"] += release_audio_claims(
                        connection,
                        [job.track_id, *[item.track_id for item in remaining]],
                    )
                raise
            except Exception:
                with connection.transaction():
                    status = mark_audio_error(
                        connection,
                        job.track_id,
                        AudioJobError("worker_unexpected", retryable=True),
                        max_attempts=max_attempts,
                    )
                if status in counts:
                    counts[status] += 1
                stop_run = True
            if stop_run:
                with connection.transaction():
                    counts["released"] += release_audio_claims(connection, [item.track_id for item in remaining])
                return counts
    return counts
