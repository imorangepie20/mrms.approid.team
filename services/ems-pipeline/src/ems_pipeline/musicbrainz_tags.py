from __future__ import annotations

import json
import os
import re
import tarfile
import unicodedata
from collections import defaultdict
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def _title_key(value: str) -> str:
    return re.sub(r"\W+", " ", unicodedata.normalize("NFKC", value).casefold()).strip()


def backfill_musicbrainz_tags(core: Path, derived_archive: Path, snapshot_id: str) -> dict[str, int]:
    """Match EMS ISRC/title/duration to MusicBrainz recordings, then store voted tags."""
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        tracks = connection.execute(
            """SELECT id, isrc, title, duration_ms, recording_mbid
                 FROM ems_tracks WHERE status = 'active' AND isrc IS NOT NULL"""
        ).fetchall()
        connection.commit()
        wanted_isrcs = {str(row["isrc"]).upper() for row in tracks}
        recording_ids_by_isrc: dict[str, set[int]] = defaultdict(set)
        with (core / "isrc").open("r", encoding="utf-8") as handle:
            for line in handle:
                columns = line.rstrip("\n").split("\t")
                if len(columns) > 2 and columns[2].upper() in wanted_isrcs:
                    recording_ids_by_isrc[columns[2].upper()].add(int(columns[1]))

        wanted_recordings = set().union(*recording_ids_by_isrc.values()) if recording_ids_by_isrc else set()
        recordings: dict[int, tuple[str, str, int | None]] = {}
        with (core / "recording").open("r", encoding="utf-8") as handle:
            for line in handle:
                columns = line.rstrip("\n").split("\t")
                if len(columns) < 5:
                    continue
                recording_id = int(columns[0])
                if recording_id in wanted_recordings:
                    duration = int(columns[4]) if columns[4].isdigit() else None
                    recordings[recording_id] = (columns[1], columns[2], duration)

        matched: dict[str, tuple[int, str]] = {}
        for track in tracks:
            choices = []
            for recording_id in recording_ids_by_isrc.get(str(track["isrc"]).upper(), ()):
                recording = recordings.get(recording_id)
                if recording is None:
                    continue
                mbid, title, duration = recording
                if track["recording_mbid"] and str(track["recording_mbid"]) != mbid:
                    continue
                title_match = _title_key(title) == _title_key(str(track["title"]))
                duration_gap = abs(duration - int(track["duration_ms"])) if duration is not None else 10**9
                mbid_match = bool(track["recording_mbid"] and str(track["recording_mbid"]) == mbid)
                if mbid_match or (title_match and duration_gap <= 5_000):
                    choices.append((not mbid_match, duration_gap, recording_id, mbid))
            if choices:
                _, _, recording_id, mbid = min(choices)
                matched[str(track["id"])] = (recording_id, mbid)

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

        tagged = 0
        with connection.transaction():
            for track_id, (recording_id, mbid) in matched.items():
                named_votes = [
                    {"name": tag_names[tag_id], "count": count}
                    for tag_id, count in votes.get(recording_id, []) if tag_id in tag_names
                ]
                named_votes.sort(key=lambda item: (-item["count"], item["name"]))
                connection.execute(
                    """UPDATE ems_tracks SET mb_tag_recording_mbid = %s,
                         mb_tags = %s, mb_tag_votes = %s::jsonb, mb_tag_snapshot_id = %s
                       WHERE id = %s""",
                    (mbid, [item["name"] for item in named_votes], json.dumps(named_votes), snapshot_id, track_id),
                )
                tagged += int(bool(named_votes))
    return {"scanned": len(tracks), "matched_recordings": len(matched), "tagged": tagged}
