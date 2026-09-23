from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable

from .importer import TidalMatch, promote_match
from .select import Candidate
from .tidal import CatalogRequestPaused, ResolveResult, ResolveStatus


@dataclass(frozen=True)
class HealthGate:
    max_disk_used_percent: int = 70

    def can_run(self, *, disk_used_percent: int, database_ready: bool, embedding_ready: bool) -> bool:
        return disk_used_percent < self.max_disk_used_percent and database_ready and embedding_ready


def retry_delay(attempt: int, retry_after_seconds: int | None) -> int:
    if retry_after_seconds is not None:
        return max(0, retry_after_seconds)
    return min(3600, max(1, int(math.pow(2, max(0, attempt)))))


def claim_candidates(connection: Any, run_id: str, *, batch_size: int = 50, lease_seconds: int = 300) -> list[dict[str, Any]]:
    if batch_size <= 0 or lease_seconds <= 0:
        raise ValueError("batch_size and lease_seconds must be positive")
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH claimed AS (
                  SELECT id
                  FROM ems_ingest_candidates
                  WHERE run_id = %s
                    AND resolver_status IN ('pending', 'retryable')
                    AND (lease_expires_at IS NULL OR lease_expires_at < now())
                    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                  ORDER BY sequence_no
                  FOR UPDATE SKIP LOCKED
                  LIMIT %s
                )
                UPDATE ems_ingest_candidates AS candidate
                SET resolver_status = 'resolving',
                    lease_expires_at = now() + make_interval(secs => %s),
                    attempt_count = candidate.attempt_count + 1
                FROM claimed
                WHERE candidate.id = claimed.id
                RETURNING candidate.id, candidate.candidate_key, candidate.title,
                          candidate.artist, candidate.album, candidate.isrc,
                          candidate.recording_mbid, candidate.duration_ms, candidate.attempt_count;
                """,
                (run_id, batch_size, lease_seconds),
            )
            return list(cursor.fetchall())


def mark_resolution(connection: Any, candidate_id: str, result: ResolveResult, *, attempt_count: int) -> None:
    delay = retry_delay(attempt_count, result.retry_after_seconds) if result.status == ResolveStatus.RETRYABLE else 0
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE ems_ingest_candidates
                   SET resolver_status = %s,
                       resolver_error_code = %s,
                       query_hash = %s,
                       match_rule = %s,
                       next_attempt_at = CASE WHEN %s > 0 THEN now() + make_interval(secs => %s) ELSE NULL END,
                       resolved_at = CASE WHEN %s IN ('ambiguous', 'not_found', 'unavailable', 'budget_exhausted') THEN now() ELSE NULL END,
                       lease_expires_at = NULL
                 WHERE id = %s
                """,
                (result.status.value, result.error_code, result.query_hash, result.match_rule, delay, delay, result.status.value, candidate_id),
            )


def run_worker(connection: Any, run_id: str, catalog_client: Any, *, batch_size: int = 50, max_batches: int | None = None, on_result: Callable[[ResolveResult], None] | None = None) -> dict[str, int]:
    counts = {status.value: 0 for status in ResolveStatus}
    batches = 0
    while max_batches is None or batches < max_batches:
        claimed = claim_candidates(connection, run_id, batch_size=batch_size)
        if not claimed:
            break
        batches += 1
        for row in claimed:
            candidate = Candidate(
                candidate_key=str(row.get("candidate_key", "")),
                recording_mbid=row.get("recording_mbid"),
                isrc=row.get("isrc"),
                title=str(row.get("title", "")),
                artist=str(row.get("artist", "")),
                album=row.get("album"),
                duration_ms=row.get("duration_ms"),
                release_date=None,
                artist_region=None,
                selection_bucket="canonical",
                selection_score=0.0,
            )
            try:
                result = catalog_client.resolve(candidate)
            except CatalogRequestPaused:
                with connection.transaction():
                    connection.execute(
                        "UPDATE ems_ingest_candidates SET resolver_status = 'pending', lease_expires_at = NULL WHERE id = %s",
                        (row["id"],),
                    )
                raise
            counts[result.status.value] += 1
            if result.status == ResolveStatus.MATCHED and result.tidal_id:
                promote_match(
                    connection,
                    str(row["id"]),
                    TidalMatch(
                        tidal_id=result.tidal_id,
                        title=result.title or candidate.title,
                        artist=result.artist or candidate.artist,
                        album=result.album if result.album is not None else candidate.album,
                        artwork_url=result.artwork_url,
                        duration_ms=max(30_000, int(result.duration_ms or candidate.duration_ms or 30_000)),
                        recording_mbid=candidate.recording_mbid,
                        isrc=candidate.isrc,
                        match_confidence=result.match_confidence,
                        match_rule=result.match_rule or "validated",
                    ),
                )
            else:
                mark_resolution(connection, str(row["id"]), result, attempt_count=int(row.get("attempt_count", 1)))
            if on_result is not None:
                on_result(result)
            if result.status == ResolveStatus.BUDGET_EXHAUSTED:
                return counts
    return counts
