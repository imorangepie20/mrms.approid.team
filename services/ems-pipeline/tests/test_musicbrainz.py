import io
import json
import tarfile
from pathlib import Path

import pytest

from ems_pipeline.musicbrainz import (
    DownloadError,
    MusicBrainzSnapshotClient,
    SnapshotManifest,
    build_manifest,
    safe_extract_members,
    verify_sha256,
)


class FakeResponse:
    def __init__(self, payload: bytes, status: int = 200) -> None:
        self.payload = payload
        self.status = status

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            payload, self.payload = self.payload, b""
            return payload
        payload, self.payload = self.payload[:size], self.payload[size:]
        return payload


def make_tar(path: Path, member_name: str, content: bytes = b"ok") -> None:
    with tarfile.open(path, "w:gz") as archive:
        info = tarfile.TarInfo(member_name)
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))


def test_rejects_tar_path_escape_before_writing(tmp_path: Path) -> None:
    archive = tmp_path / "unsafe.tar.gz"
    make_tar(archive, "../escaped.tsv")

    with pytest.raises(DownloadError, match="unsafe archive member"):
        safe_extract_members(archive, tmp_path / "out", frozenset({"../escaped.tsv"}))

    assert not (tmp_path / "escaped.tsv").exists()


def test_extracts_only_allowed_regular_members(tmp_path: Path) -> None:
    archive = tmp_path / "safe.tar.gz"
    with tarfile.open(archive, "w:gz") as handle:
        for name, content in (("recording.tsv", b"r"), ("artist.tsv", b"a")):
            info = tarfile.TarInfo(name)
            info.size = len(content)
            handle.addfile(info, io.BytesIO(content))

    destination = tmp_path / "out"
    extracted = safe_extract_members(archive, destination, frozenset({"recording.tsv"}))

    assert extracted == ["recording.tsv"]
    assert (destination / "recording.tsv").read_bytes() == b"r"
    assert not (destination / "artist.tsv").exists()


def test_checksum_mismatch_fails_before_manifest_is_built(tmp_path: Path) -> None:
    payload = tmp_path / "payload.bin"
    payload.write_bytes(b"payload")

    with pytest.raises(DownloadError, match="checksum mismatch"):
        verify_sha256(payload, "0" * 64)


def test_manifest_is_stable_and_contains_contract_fields(tmp_path: Path) -> None:
    candidate_file = tmp_path / "candidates.csv.gz"
    candidate_file.write_bytes(b"candidate")

    manifest = build_manifest(
        snapshot_id="20260919-002047",
        candidates_path=candidate_file,
        row_count=1,
        selector_version="ems-v1",
        seed=17,
    )

    assert isinstance(manifest, SnapshotManifest)
    encoded = json.loads(manifest.to_json())
    assert encoded["snapshot_id"] == "20260919-002047"
    assert encoded["source_license"] == "CC0"
    assert encoded["row_count"] == 1
    assert len(encoded["sha256"]) == 64


def test_resumes_partial_download_with_range_header(tmp_path: Path) -> None:
    destination = tmp_path / "artifact.bin"
    destination.with_suffix(".bin.part").write_bytes(b"prefix")
    seen_headers: list[dict[str, str]] = []

    def opener(request: object, **_: object) -> FakeResponse:
        seen_headers.append(dict(getattr(request, "headers")))
        return FakeResponse(b"suffix", status=206)

    MusicBrainzSnapshotClient(opener=opener)._download_atomic("https://example.test/artifact", destination)

    assert destination.read_bytes() == b"prefixsuffix"
    assert seen_headers[0]["Range"] == "bytes=6-"
