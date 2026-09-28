from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen


CHUNK_BYTES = 1024 * 1024


def digest_file(path: Path) -> tuple[int, str]:
    digest = sha256()
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(CHUNK_BYTES):
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def verify(path: Path, expected_size: int, expected_sha256: str) -> None:
    actual_size, actual_sha256 = digest_file(path)
    if actual_size != expected_size:
        raise RuntimeError(
            f"artifact_size_mismatch:{path.name}:{actual_size}:{expected_size}"
        )
    if actual_sha256 != expected_sha256:
        raise RuntimeError(
            f"artifact_sha256_mismatch:{path.name}:{actual_sha256}:{expected_sha256}"
        )


def download(url: str, destination: Path) -> None:
    request = Request(url, headers={"User-Agent": "music-pie-audio-analysis/1"})
    with urlopen(request, timeout=60) as response, destination.open("wb") as output:
        while chunk := response.read(CHUNK_BYTES):
            output.write(chunk)


def install_artifacts(manifest_path: Path, output_dir: Path) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1:
        raise RuntimeError("artifact_manifest_schema_unsupported")

    output_dir.mkdir(parents=True, exist_ok=True)
    for artifact in manifest["artifacts"]:
        destination = output_dir / artifact["name"]
        if destination.exists():
            verify(destination, artifact["size"], artifact["sha256"])
            continue

        with tempfile.NamedTemporaryFile(
            dir=output_dir,
            prefix=f".{artifact['name']}.",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
        try:
            download(artifact["url"], temporary_path)
            verify(temporary_path, artifact["size"], artifact["sha256"])
            temporary_path.replace(destination)
        finally:
            temporary_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    install_artifacts(arguments.manifest, arguments.output)


if __name__ == "__main__":
    main()
