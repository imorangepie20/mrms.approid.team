import csv
import gzip
import json
from pathlib import Path

import pytest

from ems_pipeline.importer import ManifestError, ManifestImporter, TidalMatch, promote_match
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


def test_manifest_validation_accepts_internal_tidal_artifact_license(tmp_path: Path) -> None:
    candidates = tmp_path / "candidates.csv.gz"
    write_candidates(candidates, [{"candidate_key": "a", "recording_mbid": "", "isrc": "i", "title": "T", "artist": "A", "album": "L", "duration_ms": "180000", "selection_bucket": "tidal_editorial", "selection_score": "0.9"}])
    manifest = tmp_path / "manifest.json"
    write_manifest(manifest, candidates, row_count=1)
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    payload["source_license"] = "tidal-authorized-use"
    manifest.write_text(json.dumps(payload), encoding="utf-8")

    assert ManifestImporter.validate(manifest, candidates).row_count == 1


class _Cursor:
    def __init__(self) -> None:
        self.statements: list[str] = []
        self.values: list[object] = []

    def __enter__(self) -> "_Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, sql: str, values: object = None) -> None:
        self.statements.append(sql)
        self.values.append(values)

    def fetchone(self) -> dict[str, str]:
        return {"id": "ems-track-a"}


class _Connection:
    def __init__(self) -> None:
        self.cursor_value = _Cursor()

    def transaction(self) -> object:
        class _Transaction:
            def __enter__(self) -> "_Transaction": return self
            def __exit__(self, *_: object) -> None: return None
        return _Transaction()

    def cursor(self) -> _Cursor:
        return self.cursor_value


def test_promote_match_writes_artwork_track_source_and_availability_atomically() -> None:
    connection = _Connection()
    promote_match(connection, "candidate-a", TidalMatch(tidal_id="tidal-a", title="Track", artist="Artist", album="Album", artwork_url="https://resources.tidal.com/cover.jpg", duration_ms=31000, recording_mbid="mbid-a", isrc="ISRC-A", match_confidence=1.0, match_rule="isrc_exact_tiebreak", region="KR"))
    sql = "\n".join(connection.cursor_value.statements)
    assert "INSERT INTO ems_tracks" in sql
    assert "INSERT INTO ems_track_sources" in sql
    assert "INSERT INTO ems_availability_events" in sql
    assert "UPDATE ems_ingest_candidates" in sql
    assert "artwork_url" in connection.cursor_value.statements[0]
    assert "https://resources.tidal.com/cover.jpg" in connection.cursor_value.values[0]
    assert connection.cursor_value.values[-1] == ["tidal-a", "isrc_exact_tiebreak", "candidate-a"]
