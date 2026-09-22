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


class ManifestImporter:
    @staticmethod
    def validate(manifest_path: Path, candidates_path: Path) -> ValidatedManifest:
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ManifestError("invalid manifest") from exc
        if payload.get("source_license") != "CC0":
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


def stage_candidates(connection: Any, run_id: str, candidates: Iterable[Candidate]) -> int:
    rows = list(candidates)
    if not rows:
        return 0
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO ems_ingest_candidates
                  (run_id, sequence_no, candidate_key, recording_mbid, isrc, title, artist, album,
                   duration_ms, selection_bucket, selection_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id, candidate_key) DO UPDATE
                  SET title = EXCLUDED.title, artist = EXCLUDED.artist,
                      selection_bucket = EXCLUDED.selection_bucket,
                      selection_score = EXCLUDED.selection_score
                """,
                [
                    (run_id, sequence, candidate.candidate_key, candidate.recording_mbid, candidate.isrc,
                     candidate.title, candidate.artist, candidate.album, candidate.duration_ms,
                     candidate.selection_bucket, candidate.selection_score)
                    for sequence, candidate in enumerate(rows)
                ],
            )
    return len(rows)
