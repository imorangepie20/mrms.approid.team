from __future__ import annotations

import csv
import json
import os
import re
import shutil
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
import zstandard
from psycopg.rows import dict_row

from .importer import ManifestImporter, stage_candidates
from .musicbrainz import DownloadError, MusicBrainzSnapshotClient, safe_extract_members
from .select import Candidate, CanonicalRow, _is_eligible, write_candidate_artifacts


CORE_MEMBERS = frozenset({"mbdump/recording", "mbdump/isrc", "mbdump/artist_credit"})
VERSION_PATTERN = re.compile(r"^\d{8}-\d{6}$")
CANONICAL_INDEX_PATTERN = re.compile(r"musicbrainz-canonical-dump-(\d{8}-\d{6})/")


def _version_time(version: str | None) -> str:
    if not version or not VERSION_PATTERN.fullmatch(version):
        return "1970-01-01 00:00:00"
    return datetime.strptime(version, "%Y%m%d-%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _available_disk(reserve_gib: int) -> bool:
    disk = shutil.disk_usage("/")
    return (disk.used + reserve_gib * 1024**3) / disk.total < 0.7


def _prune_old_snapshots(work_root: Path, *, canonical: bool) -> None:
    pattern = re.compile(r"^canonical-\d{8}-\d{6}$" if canonical else r"^\d{8}-\d{6}$")
    directories = sorted(path for path in work_root.iterdir() if path.is_dir() and pattern.fullmatch(path.name))
    for path in directories[:-2]:
        if path.is_symlink() or not path.resolve().is_relative_to(work_root.resolve()):
            raise DownloadError("unsafe snapshot directory")
        shutil.rmtree(path)


def _core_files(work_root: Path, version: str) -> Path:
    target = work_root / version / "selected"
    files = [target / name for name in CORE_MEMBERS]
    if all(path.is_file() for path in files):
        return target / "mbdump"
    archive = work_root / version / "mbdump.tar.bz2"
    temporary = work_root / version / "selected.part"
    if temporary.exists():
        shutil.rmtree(temporary)
    extracted = safe_extract_members(archive, temporary, CORE_MEMBERS)
    if set(extracted) != set(CORE_MEMBERS):
        raise DownloadError("core archive missing required table")
    if target.exists():
        if target.is_symlink() or not target.resolve().is_relative_to(work_root.resolve()):
            raise DownloadError("unsafe core extraction directory")
        shutil.rmtree(target)
    temporary.rename(target)
    return target / "mbdump"


def _canonical_file(work_root: Path, version: str) -> Path:
    directory = work_root / f"canonical-{version}"
    target = directory / "canonical_musicbrainz_data.csv"
    if target.is_file():
        return target
    archive = directory / f"musicbrainz-canonical-dump-{version}.tar.zst"
    temporary = directory / "canonical_musicbrainz_data.csv.part"
    wanted = f"musicbrainz-canonical-dump-{version}/canonical/canonical_musicbrainz_data.csv"
    with archive.open("rb") as compressed:
        with zstandard.ZstdDecompressor().stream_reader(compressed) as stream:
            with tarfile.open(fileobj=stream, mode="r|") as contents:
                for member in contents:
                    if member.name != wanted:
                        continue
                    if not member.isfile():
                        raise DownloadError("canonical member is not a file")
                    source = contents.extractfile(member)
                    if source is None:
                        raise DownloadError("canonical member unreadable")
                    with temporary.open("wb") as output:
                        shutil.copyfileobj(source, output)
                    temporary.replace(target)
                    return target
    raise DownloadError("canonical archive missing required data")


def _latest_core(client: MusicBrainzSnapshotClient) -> str:
    version = client._read(client.base_url + "LATEST").decode("utf-8").strip().strip("/")
    if not VERSION_PATTERN.fullmatch(version):
        raise DownloadError("invalid core version")
    return version


def _latest_canonical(client: MusicBrainzSnapshotClient) -> str:
    index = client._read("https://data.metabrainz.org/pub/musicbrainz/canonical_data/").decode("utf-8")
    versions = CANONICAL_INDEX_PATTERN.findall(index)
    if not versions:
        raise DownloadError("canonical version unavailable")
    return max(versions)


def _scan_delta(core: Path, canonical: Path, cutoff: str, existing_isrcs: set[str], existing_mbids: set[str]) -> list[Candidate]:
    new_isrc_recordings: set[str] = set()
    with (core / "isrc").open("r", encoding="utf-8") as handle:
        for line in handle:
            columns = line.rstrip("\n").split("\t")
            if len(columns) > 4 and columns[4].startswith("20") and columns[4][:19] >= cutoff:
                new_isrc_recordings.add(columns[1])

    recordings: dict[str, tuple[str, str, str, int]] = {}
    with (core / "recording").open("r", encoding="utf-8") as handle:
        for line in handle:
            columns = line.rstrip("\n").split("\t")
            updated = columns[7][:19] if len(columns) > 7 and columns[7].startswith("20") else ""
            if len(columns) < 8 or (updated < cutoff and columns[0] not in new_isrc_recordings):
                continue
            try:
                duration = int(columns[4])
            except ValueError:
                continue
            if duration < 30_000 or not columns[2].strip() or columns[1] in existing_mbids:
                continue
            recordings[columns[0]] = (columns[1], columns[2], columns[3], duration)
    if not recordings:
        return []

    isrcs: dict[str, str] = {}
    with (core / "isrc").open("r", encoding="utf-8") as handle:
        for line in handle:
            columns = line.rstrip("\n").split("\t")
            if len(columns) < 3 or columns[1] not in recordings:
                continue
            isrc = columns[2].upper()
            if isrc and isrc not in existing_isrcs and (columns[1] not in isrcs or isrc < isrcs[columns[1]]):
                isrcs[columns[1]] = isrc
    if not isrcs:
        return []

    credit_ids = {recordings[id][2] for id in isrcs}
    artists: dict[str, str] = {}
    with (core / "artist_credit").open("r", encoding="utf-8") as handle:
        for line in handle:
            columns = line.rstrip("\n").split("\t", 2)
            if len(columns) > 1 and columns[0] in credit_ids:
                artists[columns[0]] = columns[1]

    mbids = {recordings[id][0] for id in isrcs}
    canonical_metadata: dict[str, tuple[str, float]] = {}
    with canonical.open("r", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            mbid = row.get("recording_mbid") or ""
            if mbid not in mbids:
                continue
            try:
                score = max(0.0, float(row.get("score") or 0))
            except ValueError:
                score = 0.0
            previous = canonical_metadata.get(mbid)
            if previous is None or score > previous[1]:
                canonical_metadata[mbid] = (row.get("release_name") or "", score)

    candidates: list[Candidate] = []
    seen_isrcs: set[str] = set()
    for id in sorted(isrcs, key=lambda value: recordings[value][0]):
        mbid, title, credit_id, duration = recordings[id]
        isrc = isrcs[id]
        artist = artists.get(credit_id, "").strip()
        if not artist or isrc in seen_isrcs:
            continue
        seen_isrcs.add(isrc)
        album, raw_score = canonical_metadata.get(mbid, ("", 0.0))
        if not _is_eligible(CanonicalRow(mbid, isrc, title, artist, album or None, duration, None, None, 0.0)):
            continue
        candidates.append(Candidate(
            candidate_key=f"{mbid}:{isrc}", recording_mbid=mbid, isrc=isrc,
            title=title, artist=artist, album=album or None, duration_ms=duration,
            release_date=None, artist_region=None, selection_bucket="canonical",
            selection_score=raw_score / (raw_score + 100_000) if raw_score else 0.0,
        ))
    return candidates


def _mark_check(connection: Any, key: str, *, status: str = "idle", version: str | None = None, count: int | None = None, run_id: str | None = None) -> None:
    connection.execute(
        """UPDATE ems_source_routines
              SET status = %s, last_checked_at = now(),
                  last_version = COALESCE(%s, last_version),
                  last_success_at = now(), last_candidate_count = COALESCE(%s, last_candidate_count),
                  current_run_id = COALESCE(%s, current_run_id), error_code = NULL,
                  next_check_at = now() + make_interval(secs => check_interval_seconds), updated_at = now()
            WHERE source_key = %s""",
        (status, version, count, run_id, key),
    )


def _check_canonical(connection: Any, work_root: Path, client: MusicBrainzSnapshotClient, row: dict[str, Any]) -> None:
    key = "musicbrainz_canonical"
    version = _latest_canonical(client)
    target = work_root / f"canonical-{version}" / "canonical_musicbrainz_data.csv"
    if version != row["last_version"] or not target.is_file():
        if not _available_disk(12):
            raise DownloadError("disk_gate")
        connection.execute("UPDATE ems_source_routines SET status = 'downloading' WHERE source_key = %s", (key,))
        downloaded = client.download_latest_canonical(work_root)
        if downloaded != version:
            raise DownloadError("canonical version changed during download")
        _canonical_file(work_root, version)
    _mark_check(connection, key, version=version, count=0)
    _prune_old_snapshots(work_root, canonical=True)


def _check_core(connection: Any, work_root: Path, client: MusicBrainzSnapshotClient, row: dict[str, Any]) -> None:
    key = "musicbrainz_core"
    version = _latest_core(client)
    if version == row["last_version"]:
        _mark_check(connection, key, version=version)
        return
    if not _available_disk(25):
        raise DownloadError("disk_gate")
    connection.execute("UPDATE ems_source_routines SET status = 'downloading' WHERE source_key = %s", (key,))
    downloaded = client.download_latest(work_root)
    if downloaded != version:
        raise DownloadError("core version changed during download")
    core = _core_files(work_root, version)
    canonical_row = connection.execute(
        "SELECT last_version FROM ems_source_routines WHERE source_key = 'musicbrainz_canonical'"
    ).fetchone()
    canonical_version = canonical_row["last_version"]
    canonical = work_root / f"canonical-{canonical_version}" / "canonical_musicbrainz_data.csv"
    if not canonical.is_file():
        _check_canonical(connection, work_root, client, {"last_version": canonical_version})
        canonical_row = connection.execute(
            "SELECT last_version FROM ems_source_routines WHERE source_key = 'musicbrainz_canonical'"
        ).fetchone()
        canonical_version = canonical_row["last_version"]
        canonical = work_root / f"canonical-{canonical_version}" / "canonical_musicbrainz_data.csv"
    connection.execute("UPDATE ems_source_routines SET status = 'staging' WHERE source_key = %s", (key,))
    active = connection.execute(
        "SELECT isrc, recording_mbid FROM ems_tracks WHERE status = 'active'"
    ).fetchall()
    candidates = _scan_delta(
        core, canonical, _version_time(row["last_version"]),
        {str(item["isrc"]).upper() for item in active if item["isrc"]},
        {str(item["recording_mbid"]) for item in active if item["recording_mbid"]},
    )
    snapshot_id = f"core-{version}-canonical-{canonical_version}"
    candidates_path, manifest_path = write_candidate_artifacts(
        candidates, work_root / version / "candidates", snapshot_id, seed=17,
        selector_version="ems-mb-delta-v1",
    )
    manifest = ManifestImporter.validate(manifest_path, candidates_path)
    with connection.transaction():
        connection.execute(
            """INSERT INTO ems_ingest_runs
                 (run_type, snapshot_id, manifest_sha256, status, requested_count)
               VALUES ('musicbrainz_snapshot', %s, %s, 'pending', %s)
               ON CONFLICT DO NOTHING RETURNING id""",
            (snapshot_id, manifest.sha256, len(candidates)),
        )
        existing_run = connection.execute(
            """SELECT id, status, manifest_sha256 FROM ems_ingest_runs
                WHERE run_type = 'musicbrainz_snapshot' AND snapshot_id = %s""",
            (snapshot_id,),
        ).fetchone()
        if existing_run is None or str(existing_run["manifest_sha256"]).strip() != manifest.sha256:
            raise DownloadError("snapshot manifest conflict")
        run_id = str(existing_run["id"])
        if existing_run["status"] != "completed":
            stage_candidates(connection, run_id, candidates)
        _mark_check(connection, key, status="queued" if candidates and existing_run["status"] != "completed" else "idle", version=version, count=len(candidates), run_id=run_id)
        if not candidates and existing_run["status"] != "completed":
            connection.execute(
                "UPDATE ems_ingest_runs SET status = 'completed', finished_at = now() WHERE id = %s",
                (run_id,),
            )
    _prune_old_snapshots(work_root, canonical=False)


def serve_source_routines() -> None:
    database_url = os.environ["DATABASE_URL"].strip()
    work_root = Path(os.environ.get("MUSICBRAINZ_WORK_ROOT", "/data/musicbrainz")).resolve()
    work_root.mkdir(parents=True, exist_ok=True)
    gpg_home = work_root / "gnupg"
    gpg_home.mkdir(mode=0o700, exist_ok=True)
    gpg_home.chmod(0o700)
    os.environ["GNUPGHOME"] = str(gpg_home)
    client = MusicBrainzSnapshotClient()
    while True:
        try:
            with psycopg.connect(database_url, row_factory=dict_row, autocommit=True) as connection:
                locked = connection.execute(
                    "SELECT pg_try_advisory_lock(hashtext('music-pie-ems-source-routines')) AS locked"
                ).fetchone()["locked"]
                if not locked:
                    time.sleep(30)
                    continue
                while True:
                    row = connection.execute(
                        """SELECT source_key, last_version FROM ems_source_routines s
                            WHERE enabled AND source_key IN ('musicbrainz_canonical', 'musicbrainz_core')
                              AND next_check_at <= now()
                              AND NOT EXISTS (
                                SELECT 1 FROM ems_ingest_runs r WHERE r.id = s.current_run_id
                                  AND r.status IN ('pending', 'running', 'paused'))
                            ORDER BY CASE source_key WHEN 'musicbrainz_canonical' THEN 0 ELSE 1 END LIMIT 1"""
                    ).fetchone()
                    if row is None:
                        time.sleep(30)
                        continue
                    key = row["source_key"]
                    connection.execute(
                        "UPDATE ems_source_routines SET status = 'checking', updated_at = now() WHERE source_key = %s",
                        (key,),
                    )
                    try:
                        if key == "musicbrainz_canonical":
                            _check_canonical(connection, work_root, client, row)
                        else:
                            _check_core(connection, work_root, client, row)
                    except Exception as error:
                        code = str(error) if isinstance(error, DownloadError) and str(error) == "disk_gate" else type(error).__name__.lower()
                        connection.execute(
                            """UPDATE ems_source_routines SET status = 'failed', error_code = %s,
                                      last_checked_at = now(), next_check_at = now() + interval '1 hour',
                                      updated_at = now() WHERE source_key = %s""",
                            (code, key),
                        )
                        print(json.dumps({"source": key, "status": "failed", "error_code": code}), flush=True)
        except psycopg.Error:
            time.sleep(30)
