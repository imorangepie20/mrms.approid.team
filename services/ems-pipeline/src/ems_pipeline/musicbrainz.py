from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import sys
import re
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Callable, Iterable
from urllib.parse import urljoin
from urllib.request import Request, urlopen


class DownloadError(RuntimeError):
    """Raised when a source artifact cannot be trusted or safely handled."""


MUSICBRAINZ_FULLEXPORT = "https://data.metabrainz.org/pub/musicbrainz/data/fullexport/"
MUSICBRAINZ_SIGNING_KEY_ID = "C777580F"
MUSICBRAINZ_SIGNING_FINGERPRINT = "D5E63B4BDCCE195642948684B8FC2375C777580F"


@dataclass(frozen=True)
class SnapshotManifest:
    snapshot_id: str
    source_license: str
    row_count: int
    sha256: str
    selector_version: str
    seed: int

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sha256(path: Path, expected: str) -> str:
    normalized = expected.strip().lower()
    if len(normalized) != 64 or any(char not in "0123456789abcdef" for char in normalized):
        raise DownloadError("invalid checksum")
    actual = sha256_file(path)
    if actual != normalized:
        raise DownloadError(f"checksum mismatch for {path.name}")
    return actual


def _safe_target(destination: Path, member_name: str) -> Path:
    pure = PurePosixPath(member_name)
    if pure.is_absolute() or ".." in pure.parts or not pure.parts:
        raise DownloadError(f"unsafe archive member: {member_name}")
    target = (destination / Path(*pure.parts)).resolve()
    root = destination.resolve()
    if target != root and root not in target.parents:
        raise DownloadError(f"unsafe archive member: {member_name}")
    return target


def safe_extract_members(archive_path: Path, destination: Path, allowed: frozenset[str]) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    extracted: list[str] = []
    with tarfile.open(archive_path, "r:*") as archive:
        for member in archive:
            if member.name not in allowed:
                continue
            if member.issym() or member.islnk() or not member.isfile():
                raise DownloadError(f"unsafe archive member: {member.name}")
            target = _safe_target(destination, member.name)
            target.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                raise DownloadError(f"unreadable archive member: {member.name}")
            with target.open("xb") as output:
                shutil.copyfileobj(source, output)
            extracted.append(member.name)
    return extracted


def build_manifest(
    snapshot_id: str,
    candidates_path: Path,
    row_count: int,
    selector_version: str,
    seed: int,
    source_license: str = "CC0",
) -> SnapshotManifest:
    if row_count < 0:
        raise ValueError("row_count must be non-negative")
    return SnapshotManifest(
        snapshot_id=snapshot_id,
        source_license=source_license,
        row_count=row_count,
        sha256=sha256_file(candidates_path),
        selector_version=selector_version,
        seed=seed,
    )


def verify_detached_signature(checksum_file: Path, signature_file: Path) -> None:
    gpg = "gpg"
    if sys.platform == "win32" and not shutil.which(gpg):
        candidate = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "GnuPG" / "bin" / "gpg.exe"
        if candidate.exists():
            gpg = str(candidate)
    try:
        result = subprocess.run(
            [gpg, "--batch", "--status-fd", "1", "--verify", str(signature_file), str(checksum_file)],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        raise DownloadError("signature verifier unavailable") from exc
    if result.returncode != 0 or "[GNUPG:] GOODSIG" not in result.stdout:
        raise DownloadError("signature verification failed")


def ensure_musicbrainz_signing_key(gpg: str = "gpg") -> None:
    if sys.platform == "win32" and not shutil.which(gpg):
        candidate = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "GnuPG" / "bin" / "gpg.exe"
        if candidate.exists():
            gpg = str(candidate)
    try:
        listing = subprocess.run([gpg, "--batch", "--with-colons", "--fingerprint", MUSICBRAINZ_SIGNING_KEY_ID], capture_output=True, text=True, check=False)
        if MUSICBRAINZ_SIGNING_FINGERPRINT not in listing.stdout:
            fetched = subprocess.run([gpg, "--batch", "--keyserver", "hkps://keyserver.ubuntu.com", "--recv-keys", MUSICBRAINZ_SIGNING_KEY_ID], capture_output=True, text=True, check=False)
            if fetched.returncode != 0:
                raise DownloadError("MusicBrainz signing key unavailable")
            listing = subprocess.run([gpg, "--batch", "--with-colons", "--fingerprint", MUSICBRAINZ_SIGNING_KEY_ID], capture_output=True, text=True, check=False)
        if MUSICBRAINZ_SIGNING_FINGERPRINT not in listing.stdout:
            raise DownloadError("MusicBrainz signing key fingerprint mismatch")
    except OSError as exc:
        raise DownloadError("signature verifier unavailable") from exc


class MusicBrainzSnapshotClient:
    def __init__(
        self,
        base_url: str = MUSICBRAINZ_FULLEXPORT,
        opener: Callable[..., object] = urlopen,
    ) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.opener = opener

    def _read(self, url: str, headers: dict[str, str] | None = None) -> bytes:
        request_headers = {"User-Agent": "music-pie-ems/0.1", **(headers or {})}
        request = Request(url, headers=request_headers)
        try:
            with self.opener(request, timeout=60) as response:  # type: ignore[call-arg]
                return response.read()
        except Exception as exc:  # pragma: no cover - transport-specific
            raise DownloadError(f"download failed: {url}") from exc

    def _download_atomic(self, url: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        part = destination.with_suffix(destination.suffix + ".part")
        existing = part.stat().st_size if part.exists() else 0
        headers = {"Range": f"bytes={existing}-"} if existing else {}
        request = Request(url, headers={"User-Agent": "music-pie-ems/0.1", **headers})
        try:
            with self.opener(request, timeout=60) as response:  # type: ignore[call-arg]
                status = getattr(response, "status", None)
                append = existing > 0 and status == 206
                if existing > 0 and not append:
                    existing = 0
                with part.open("ab" if append else "wb") as output:
                    for chunk in iter(lambda: response.read(1024 * 1024), b""):
                        output.write(chunk)
        except Exception as exc:  # pragma: no cover - transport-specific
            raise DownloadError(f"download failed: {url}") from exc
        os.replace(part, destination)

    def download_latest(self, work_root: Path) -> str:
        work_root.mkdir(parents=True, exist_ok=True)
        latest = self._read(urljoin(self.base_url, "LATEST")).decode("utf-8").strip().strip("/")
        latest_path = PurePosixPath(latest)
        if not latest or latest_path.is_absolute() or any(part in {"", ".", ".."} for part in latest_path.parts):
            raise DownloadError("invalid LATEST snapshot")
        snapshot_dir = work_root / latest
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        checksum_url = urljoin(self.base_url, f"{latest}/SHA256SUMS")
        checksum_path = snapshot_dir / "SHA256SUMS"
        signature_path = snapshot_dir / "SHA256SUMS.asc"
        archive_path = snapshot_dir / "mbdump.tar.bz2"
        self._download_atomic(checksum_url, checksum_path)
        self._download_atomic(urljoin(self.base_url, f"{latest}/SHA256SUMS.asc"), signature_path)
        ensure_musicbrainz_signing_key()
        verify_detached_signature(checksum_path, signature_path)
        self._download_atomic(urljoin(self.base_url, f"{latest}/mbdump.tar.bz2"), archive_path)
        expected = next(
            (line.split()[0] for line in checksum_path.read_text(encoding="utf-8").splitlines() if "mbdump.tar.bz2" in line),
            None,
        )
        if expected is None:
            raise DownloadError("mbdump checksum missing")
        verify_sha256(archive_path, expected)
        return latest

    def download_latest_canonical(self, work_root: Path) -> str:
        index = self._read("https://data.metabrainz.org/pub/musicbrainz/canonical_data/").decode("utf-8")
        snapshots = sorted(set(re.findall(r"musicbrainz-canonical-dump-(\d{8}-\d{6})/", index)))
        if not snapshots:
            raise DownloadError("canonical snapshot not found")
        snapshot_id = snapshots[-1]
        name = f"musicbrainz-canonical-dump-{snapshot_id}.tar.zst"
        snapshot_dir = work_root / f"canonical-{snapshot_id}"
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        archive_path = snapshot_dir / name
        checksum_path = snapshot_dir / f"{name}.sha256"
        base = f"https://data.metabrainz.org/pub/musicbrainz/canonical_data/musicbrainz-canonical-dump-{snapshot_id}/"
        self._download_atomic(base + name, archive_path)
        self._download_atomic(base + f"{name}.sha256", checksum_path)
        expected = checksum_path.read_text(encoding="utf-8").split()[0]
        verify_sha256(archive_path, expected)
        return snapshot_id


if __name__ == "__main__":
    from .cli import main

    raise SystemExit(main())
