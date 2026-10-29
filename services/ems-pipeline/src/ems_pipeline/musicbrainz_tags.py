from __future__ import annotations

import json
import os
import re
import tarfile
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import httpx
import psycopg
from psycopg.rows import dict_row

from .musicbrainz_match import match_recordings


def _first_release_dates(mbids: set[str]) -> dict[str, str]:
    dates: dict[str, str] = {}
    latest = date.today() + timedelta(days=366)
    ordered = sorted(mbids)
    last_request = 0.0
    with httpx.Client(timeout=30, headers={"User-Agent": "music-pie-ems/0.1 (https://mrms.approid.team)"}) as client:
        for offset in range(0, len(ordered), 50):
            batch = ordered[offset:offset + 50]
            wanted = set(batch)
            for attempt in range(5):
                time.sleep(max(0.0, 2.0 - (time.monotonic() - last_request)))
                last_request = time.monotonic()
                try:
                    response = client.get(
                        "https://musicbrainz.org/ws/2/recording/",
                        params={"query": " OR ".join(f"rid:{mbid}" for mbid in batch), "fmt": "json", "limit": "100"},
                    )
                except httpx.RequestError:
                    if attempt == 4:
                        raise
                    time.sleep(min(30, 2 ** attempt))
                    continue
                if response.status_code in {429, 503} or response.status_code >= 500:
                    if attempt == 4:
                        response.raise_for_status()
                    retry_after = response.headers.get("Retry-After", "")
                    delay = float(retry_after) if retry_after.replace(".", "", 1).isdigit() else 2 ** attempt
                    time.sleep(min(120, max(2.0, delay)))
                    continue
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict) or not isinstance(payload.get("recordings"), list):
                    raise ValueError("invalid MusicBrainz recording search response")
                for item in payload["recordings"]:
                    if not isinstance(item, dict):
                        continue
                    mbid = str(item.get("id") or "")
                    raw = item.get("first-release-date")
                    if mbid not in wanted or not isinstance(raw, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
                        continue
                    try:
                        released = date.fromisoformat(raw)
                    except ValueError:
                        continue
                    if released <= latest:
                        dates[mbid] = raw
                break
    return dates


def backfill_musicbrainz_tags(core: Path, derived_archive: Path, snapshot_id: str) -> dict[str, int]:
    """Refresh MusicBrainz tags and first release dates for unprocessed EMS tracks."""
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        tracks = connection.execute(
            """SELECT id, isrc, title, duration_ms, recording_mbid
                 FROM ems_tracks WHERE status = 'active'
                   AND (isrc IS NOT NULL OR recording_mbid IS NOT NULL)
                   AND mb_metadata_snapshot_id IS DISTINCT FROM %s""",
            (snapshot_id,),
        ).fetchall()
        connection.commit()
        if not tracks:
            return {"scanned": 0, "matched_recordings": 0, "tagged": 0, "dated": 0}
        matched = match_recordings(core, tracks)

        wanted_recordings = {item[0] for item in matched.values()}
        votes: dict[int, list[tuple[int, int]]] = defaultdict(list)
        tag_names: dict[int, str] = {}
        found_members: set[str] = set()
        with tarfile.open(derived_archive, mode="r|bz2") as archive:
            for member in archive:
                name = member.name.rsplit("/", 1)[-1]
                if name not in {"recording_tag", "tag"} or not member.isfile():
                    continue
                found_members.add(name)
                source = archive.extractfile(member)
                if source is None:
                    raise ValueError(f"unreadable derived member: {name}")
                for raw in source:
                    columns = raw.decode("utf-8").rstrip("\n").split("\t")
                    if name == "recording_tag" and len(columns) >= 3:
                        recording_id = int(columns[0])
                        if recording_id in wanted_recordings:
                            count = int(columns[2])
                            if count > 0:
                                votes[recording_id].append((int(columns[1]), count))
                    elif name == "tag" and len(columns) >= 2:
                        if columns[1].strip():
                            tag_names[int(columns[0])] = columns[1]
                if found_members == {"recording_tag", "tag"}:
                    break
        if found_members != {"recording_tag", "tag"}:
            raise ValueError("derived archive missing recording_tag or tag")

        release_dates = _first_release_dates({mbid for _, mbid in matched.values()})
        tagged = 0
        dated = 0
        for offset in range(0, len(tracks), 500):
            with connection.transaction():
                for track in tracks[offset:offset + 500]:
                    track_id = str(track["id"])
                    recording = matched.get(track_id)
                    recording_id, mbid = recording if recording else (None, None)
                    named_votes = [
                        {"name": tag_names[tag_id], "count": count}
                        for tag_id, count in votes.get(recording_id, []) if tag_id in tag_names
                    ]
                    named_votes.sort(key=lambda item: (-item["count"], item["name"]))
                    release_date = release_dates.get(mbid)
                    connection.execute(
                        """UPDATE ems_tracks SET mb_tag_recording_mbid = %s,
                             mb_tags = %s, mb_tag_votes = %s::jsonb, mb_tag_snapshot_id = %s,
                             mb_first_release_date = %s, mb_metadata_snapshot_id = %s
                           WHERE id = %s""",
                        (mbid, [item["name"] for item in named_votes], json.dumps(named_votes),
                         snapshot_id if recording else None, release_date, snapshot_id, track_id),
                    )
                    tagged += int(bool(named_votes))
                    dated += int(release_date is not None)
    return {"scanned": len(tracks), "matched_recordings": len(matched), "tagged": tagged, "dated": dated}
