from __future__ import annotations

from dataclasses import dataclass
import csv
import gzip
import hashlib
import io
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class CanonicalRow:
    recording_mbid: str
    isrc: str | None
    title: str
    artist: str
    album: str | None
    duration_ms: int | None
    release_date: str | None
    artist_region: str | None
    canonical_score: float


@dataclass(frozen=True)
class Candidate:
    candidate_key: str
    recording_mbid: str | None
    isrc: str | None
    title: str
    artist: str
    album: str | None
    duration_ms: int | None
    release_date: str | None
    artist_region: str | None
    selection_bucket: str
    selection_score: float


def _key(row: CanonicalRow) -> str:
    return f"{row.recording_mbid}:{(row.isrc or '').upper()}"


_NON_MUSIC_TERMS = ("interview", "podcast", "spoken word", "audiobook", "radio show", "radio interview", "commentary", "dialogue", "skit")


def _is_eligible(row: CanonicalRow) -> bool:
    if not row.isrc or not row.title.strip() or not row.artist.strip():
        return False
    if row.duration_ms is None or row.duration_ms < 30_000:
        return False
    text = f"{row.title} {row.album or ''}".casefold()
    return not any(term in text for term in _NON_MUSIC_TERMS)


def _quality_score(row: CanonicalRow) -> float:
    return max(0.0, min(1.0, row.canonical_score))


def _stable_rank(row: CanonicalRow, seed: int) -> str:
    return hashlib.sha256(f"{seed}:{_key(row)}".encode("utf-8")).hexdigest()


class CandidateSelector:
    def __init__(self, seed: int = 17) -> None:
        self.seed = seed

    def select(self, rows: Iterable[CanonicalRow], limit: int) -> list[Candidate]:
        if limit < 0:
            raise ValueError("limit must be non-negative")
        unique = {row.recording_mbid: row for row in rows if _is_eligible(row)}
        ordered = list(unique.values())
        ordered.sort(key=lambda row: _stable_rank(row, self.seed))
        if not ordered or limit == 0:
            return []

        canonical_count = min(limit, int(limit * 0.6))
        diversity_count = min(limit - canonical_count, int(limit * 0.3))
        targets = [("canonical", canonical_count), ("diversity", diversity_count), ("long_tail", limit - canonical_count - diversity_count)]
        artist_cap = max(1, min(5, (limit + 199) // 200))
        release_cap = 5
        selected: list[Candidate] = []
        selected_keys: set[str] = set()
        artists: dict[str, int] = {}
        releases: dict[str, int] = {}

        def try_add(row: CanonicalRow, bucket: str) -> bool:
            candidate_key = _key(row)
            if candidate_key in selected_keys:
                return False
            if artists.get(row.artist, 0) >= artist_cap:
                return False
            release = row.album or "unknown"
            if releases.get(release, 0) >= release_cap:
                return False
            selected.append(Candidate(
                candidate_key=candidate_key,
                recording_mbid=row.recording_mbid,
                isrc=row.isrc,
                title=row.title,
                artist=row.artist,
                album=row.album,
                duration_ms=row.duration_ms,
                release_date=row.release_date,
                artist_region=row.artist_region,
                selection_bucket=bucket,
                selection_score=_quality_score(row),
            ))
            selected_keys.add(candidate_key)
            artists[row.artist] = artists.get(row.artist, 0) + 1
            releases[release] = releases.get(release, 0) + 1
            return True

        canonical = sorted(ordered, key=lambda row: (-_quality_score(row), _stable_rank(row, self.seed)))
        diverse = sorted(ordered, key=lambda row: (-_quality_score(row), row.artist_region or "unknown", (row.release_date or "")[:4], _stable_rank(row, self.seed)))
        long_tail = sorted(ordered, key=lambda row: (-_quality_score(row), row.release_date or "", _stable_rank(row, self.seed)))
        sources = {"canonical": canonical, "diversity": diverse, "long_tail": long_tail}
        for bucket, target in targets:
            for row in sources[bucket]:
                if len(selected) >= limit or sum(item.selection_bucket == bucket for item in selected) >= target:
                    break
                try_add(row, bucket)

        if len(selected) < limit:
            for row in canonical + diverse + long_tail:
                if len(selected) >= limit:
                    break
                try_add(row, "long_tail")
        return selected


def write_candidate_artifacts(
    candidates: list[Candidate],
    output_dir: Path,
    snapshot_id: str,
    seed: int,
    selector_version: str = "ems-v1",
    source_license: str = "CC0",
) -> tuple[Path, Path]:
    from .musicbrainz import build_manifest

    output_dir.mkdir(parents=True, exist_ok=True)
    candidates_path = output_dir / "candidates.csv.gz"
    fieldnames = [
        "candidate_key", "recording_mbid", "isrc", "title", "artist", "album",
        "duration_ms", "selection_bucket", "selection_score",
    ]
    with candidates_path.open("wb") as raw_handle:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw_handle, mtime=0) as compressed_handle:
            with io.TextIOWrapper(compressed_handle, newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames)
                writer.writeheader()
                for candidate in candidates:
                    writer.writerow({
                        "candidate_key": candidate.candidate_key,
                        "recording_mbid": candidate.recording_mbid,
                        "isrc": candidate.isrc or "",
                        "title": candidate.title,
                        "artist": candidate.artist,
                        "album": candidate.album or "",
                        "duration_ms": candidate.duration_ms or "",
                        "selection_bucket": candidate.selection_bucket,
                        "selection_score": candidate.selection_score,
                    })
    manifest = build_manifest(snapshot_id, candidates_path, len(candidates), selector_version, seed, source_license=source_license)
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(manifest.to_json(), encoding="utf-8")
    return candidates_path, manifest_path


def select_snapshot(work_root: Path, snapshot_id: str, limit: int = 1000, seed: int = 17) -> tuple[Path, Path]:
    """Select from the normalized canonical_rows.csv produced by extraction."""
    source = work_root / snapshot_id / "canonical_rows.csv"
    if not source.exists():
        raise FileNotFoundError(f"normalized source is missing: {source}")
    rows: list[CanonicalRow] = []
    with source.open("r", newline="", encoding="utf-8") as handle:
        for item in csv.DictReader(handle):
            rows.append(CanonicalRow(
                recording_mbid=item["recording_mbid"],
                isrc=item.get("isrc") or None,
                title=item["title"],
                artist=item["artist"],
                album=item.get("album") or None,
                duration_ms=int(item["duration_ms"]) if item.get("duration_ms") else None,
                release_date=item.get("release_date") or None,
                artist_region=item.get("artist_region") or None,
                canonical_score=float(item.get("canonical_score", "0")),
            ))
    selected = CandidateSelector(seed=seed).select(rows, limit)
    return write_candidate_artifacts(selected, work_root / snapshot_id / "candidates", snapshot_id, seed)
