import csv
import gzip
import json
from pathlib import Path

import pytest

from ems_pipeline.importer import ManifestError, ManifestImporter
from ems_pipeline.musicbrainz import sha256_file


def write_candidates(path: Path, rows: list[dict[str, str]]) -> None:
    with gzip.open(path, "wt", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["candidate_key", "recording_mbid", "isrc", "title", "artist", "album", "duration_ms", "selection_bucket", "selection_score"])
        writer.writeheader()
        writer.writerows(rows)


def write_manifest(path: Path, candidate_path: Path, row_count: int) -> None:
    path.write_text(json.dumps({
        "snapshot_id": "snapshot-a",
        "source_license": "CC0",
        "schema_version": 1,
        "row_count": row_count,
        "sha256": sha256_file(candidate_path),
        "selector_version": "ems-v1",
        "seed": 17,
    }), encoding="utf-8")


def test_manifest_validation_rejects_checksum_before_opening_database(tmp_path: Path) -> None:
    candidates = tmp_path / "candidates.csv.gz"
    write_candidates(candidates, [{"candidate_key": "a", "recording_mbid": "m", "isrc": "i", "title": "T", "artist": "A", "album": "L", "duration_ms": "180000", "selection_bucket": "canonical", "selection_score": "0.9"}])
    manifest = tmp_path / "manifest.json"
    write_manifest(manifest, candidates, row_count=1)
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    payload["sha256"] = "0" * 64
    manifest.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ManifestError, match="checksum"):
        ManifestImporter.validate(manifest, candidates)


def test_manifest_validation_reads_expected_header_and_count(tmp_path: Path) -> None:
    candidates = tmp_path / "candidates.csv.gz"
    write_candidates(candidates, [{"candidate_key": "a", "recording_mbid": "m", "isrc": "i", "title": "T", "artist": "A", "album": "L", "duration_ms": "180000", "selection_bucket": "canonical", "selection_score": "0.9"}])
    manifest = tmp_path / "manifest.json"
    write_manifest(manifest, candidates, row_count=1)

    validated = ManifestImporter.validate(manifest, candidates)

    assert validated.row_count == 1
    assert validated.snapshot_id == "snapshot-a"
