from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class HealthGate:
    max_disk_used_percent: int = 70

    def can_run(self, *, disk_used_percent: int, database_ready: bool, embedding_ready: bool) -> bool:
        return disk_used_percent < self.max_disk_used_percent and database_ready and embedding_ready


def retry_delay(attempt: int, retry_after_seconds: int | None) -> int:
    if retry_after_seconds is not None:
        return max(0, min(3600, retry_after_seconds))
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
                          candidate.recording_mbid, candidate.duration_ms;
                """,
                (run_id, batch_size, lease_seconds),
            )
            return list(cursor.fetchall())
