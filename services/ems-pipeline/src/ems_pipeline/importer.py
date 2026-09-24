from __future__ import annotations

import csv
import gzip
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator

from .musicbrainz import sha256_file
from .select import Candidate


class ManifestError(ValueError):
    """Raised before any database write when an artifact contract is invalid."""


EXPECTED_HEADER = (
    "candidate_key",
    "recording_mbid",
    "isrc",
    "title",
    "artist",
    "album",
    "duration_ms",
    "selection_bucket",
    "selection_score",
)


@dataclass(frozen=True)
class ValidatedManifest:
    snapshot_id: str
    row_count: int
    sha256: str
    schema_version: int
    selector_version: str
    seed: int


@dataclass(frozen=True)
class TidalMatch:
    tidal_id: str
    title: str
    artist: str
    album: str | None
    artwork_url: str | None
    duration_ms: int
    recording_mbid: str | None
    isrc: str | None
    match_confidence: float
    match_rule: str = "validated"
    region: str = "KR"
    release_date: str | None = None
    source_metadata: dict[str, Any] | None = None


def promote_match(connection: Any, candidate_id: str, match: TidalMatch) -> str:
    with connection.transaction():
        with connection.cursor() as cursor:
            track = cursor.execute(
                """
                INSERT INTO ems_tracks
                  (recording_mbid, isrc, tidal_id, title, artist, album, artwork_url, duration_ms,
                   release_date, tidal_album_release_date, status, match_confidence, catalog_priority, last_verified_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, 0, now(), now())
                ON CONFLICT (tidal_id) DO UPDATE SET
                  recording_mbid = COALESCE(ems_tracks.recording_mbid, EXCLUDED.recording_mbid),
                  isrc = COALESCE(ems_tracks.isrc, EXCLUDED.isrc),
                  title = EXCLUDED.title, artist = EXCLUDED.artist, album = EXCLUDED.album,
                  artwork_url = COALESCE(EXCLUDED.artwork_url, ems_tracks.artwork_url),
                  duration_ms = EXCLUDED.duration_ms, status = 'active',
                  release_date = COALESCE(ems_tracks.release_date, EXCLUDED.release_date),
                  tidal_album_release_date = COALESCE(EXCLUDED.tidal_album_release_date, ems_tracks.tidal_album_release_date),
                  match_confidence = GREATEST(ems_tracks.match_confidence, EXCLUDED.match_confidence),
                  last_verified_at = now(), updated_at = now()
                RETURNING id
                """,
                [match.recording_mbid, match.isrc, match.tidal_id, match.title, match.artist, match.album, match.artwork_url, match.duration_ms, match.release_date, match.release_date, match.match_confidence],
            )
            track_row = cursor.fetchone()
            track_id = track_row["id"] if track_row else None
            if not track_id:
                raise RuntimeError("ems_track_promotion_missing")
            cursor.execute(
                """
                INSERT INTO ems_track_sources (track_id, source_type, source_id, source_license, metadata, last_seen_at)
                VALUES (%s, 'tidal', %s, 'tidal-authorized-use', %s::jsonb, now())
                ON CONFLICT (source_type, source_id) DO UPDATE SET track_id = EXCLUDED.track_id,
                  metadata = CASE WHEN EXCLUDED.metadata = '{}'::jsonb THEN ems_track_sources.metadata ELSE EXCLUDED.metadata END,
                  last_seen_at = now()
                """,
                [track_id, match.tidal_id, json.dumps(match.source_metadata or {})],
            )
            if match.recording_mbid:
                cursor.execute(
                    """INSERT INTO ems_track_sources
                         (track_id, source_type, source_id, source_version, source_license, last_seen_at)
                       SELECT %s, 'musicbrainz', %s, r.snapshot_id, 'CC0', now()
                         FROM ems_ingest_candidates c JOIN ems_ingest_runs r ON r.id = c.run_id
                        WHERE c.id = %s
                       ON CONFLICT (source_type, source_id) DO UPDATE
                         SET track_id = EXCLUDED.track_id, source_version = EXCLUDED.source_version,
                             last_seen_at = now()""",
                    [track_id, match.recording_mbid, candidate_id],
                )
            cursor.execute(
                """
                INSERT INTO ems_availability_events (track_id, region, capability, playable)
                VALUES (%s, %s, 'STREAM', true)
                """,
                [track_id, match.region],
            )
            cursor.execute(
                """
                UPDATE ems_ingest_candidates
                   SET resolver_status = 'matched', tidal_id = %s, match_rule = %s, resolved_at = now(), lease_expires_at = NULL
                 WHERE id = %s
                """,
                [match.tidal_id, match.match_rule, candidate_id],
            )
            return str(track_id)


class ManifestImporter:
    @staticmethod
    def validate(manifest_path: Path, candidates_path: Path) -> ValidatedManifest:
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ManifestError("invalid manifest") from exc
        if payload.get("source_license") not in {"CC0", "tidal-authorized-use"}:
            raise ManifestError("unsupported source license")
        expected = str(payload.get("sha256", "")).lower()
        if len(expected) != 64 or sha256_file(candidates_path) != expected:
            raise ManifestError("checksum mismatch")
        expected_count = payload.get("row_count")
        if not isinstance(expected_count, int) or expected_count < 0:
            raise ManifestError("invalid row count")
        row_count = 0
        with gzip.open(candidates_path, "rt", newline="", encoding="utf-8") as handle:
            reader = csv.reader(handle)
            header = tuple(next(reader, ()))
            if header != EXPECTED_HEADER:
                raise ManifestError("candidate header mismatch")
            row_count = sum(1 for _ in reader)
        if row_count != expected_count:
            raise ManifestError("candidate row count mismatch")
        return ValidatedManifest(
            snapshot_id=str(payload["snapshot_id"]),
            row_count=row_count,
            sha256=expected,
            schema_version=int(payload.get("schema_version", 1)),
            selector_version=str(payload["selector_version"]),
            seed=int(payload["seed"]),
        )

    @staticmethod
    def iter_candidates(candidates_path: Path) -> Iterator[dict[str, str]]:
        with gzip.open(candidates_path, "rt", newline="", encoding="utf-8") as handle:
            yield from csv.DictReader(handle)


def stage_candidates(connection: Any, run_id: str, candidates: Iterable[Candidate], *, sequence_start: int = 0) -> int:
    rows = list(candidates)
    if not rows:
        return 0
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO ems_ingest_candidates
                  (run_id, sequence_no, candidate_key, recording_mbid, isrc, title, artist, album,
                   duration_ms, release_date, selection_bucket, selection_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id, candidate_key) DO UPDATE
                  SET title = EXCLUDED.title, artist = EXCLUDED.artist,
                      selection_bucket = EXCLUDED.selection_bucket,
                      selection_score = EXCLUDED.selection_score
                """,
                [
                    (run_id, sequence, candidate.candidate_key, candidate.recording_mbid, candidate.isrc,
                     candidate.title, candidate.artist, candidate.album, candidate.duration_ms, candidate.release_date,
                     candidate.selection_bucket, candidate.selection_score)
                    for sequence, candidate in enumerate(rows, start=sequence_start)
                ],
            )
    return len(rows)
