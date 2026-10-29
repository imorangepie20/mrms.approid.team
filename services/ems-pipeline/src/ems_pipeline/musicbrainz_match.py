from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence


def title_key(value: str) -> str:
    return re.sub(r"\W+", " ", unicodedata.normalize("NFKC", value).casefold()).strip()


def match_recordings_with_credits(
    core: Path, rows: Sequence[Mapping[str, Any]]
) -> tuple[dict[str, tuple[int, str]], dict[int, int | None]]:
    """Match rows to MusicBrainz recordings; also return each matched recording's artist_credit id."""
    wanted_isrcs = {str(row["isrc"]).upper() for row in rows if row["isrc"]}
    wanted_mbids = {str(row["recording_mbid"]) for row in rows if row["recording_mbid"]}
    recording_ids_by_isrc: dict[str, set[int]] = defaultdict(set)
    with (core / "isrc").open("r", encoding="utf-8") as handle:
        for line in handle:
            columns = line.rstrip("\n").split("\t")
            if len(columns) > 2 and columns[1].isdigit() and columns[2].upper() in wanted_isrcs:
                recording_ids_by_isrc[columns[2].upper()].add(int(columns[1]))

    wanted_recordings = set().union(*recording_ids_by_isrc.values()) if recording_ids_by_isrc else set()
    recordings: dict[int, tuple[str, str, int | None, int | None]] = {}
    recording_ids_by_mbid: dict[str, int] = {}
    with (core / "recording").open("r", encoding="utf-8") as handle:
        for line in handle:
            columns = line.rstrip("\n").split("\t")
            if len(columns) < 5 or not columns[0].isdigit():
                continue
            recording_id = int(columns[0])
            if recording_id in wanted_recordings or columns[1] in wanted_mbids:
                duration = int(columns[4]) if columns[4].isdigit() else None
                credit = int(columns[3]) if columns[3].isdigit() else None
                recordings[recording_id] = (columns[1], columns[2], duration, credit)
                if columns[1] in wanted_mbids:
                    recording_ids_by_mbid[columns[1]] = recording_id

    matched: dict[str, tuple[int, str]] = {}
    for track in rows:
        choices = []
        recording_ids = set(recording_ids_by_isrc.get(str(track["isrc"]).upper(), ()))
        direct_id = recording_ids_by_mbid.get(str(track["recording_mbid"]))
        if direct_id is not None:
            recording_ids.add(direct_id)
        for recording_id in recording_ids:
            recording = recordings.get(recording_id)
            if recording is None:
                continue
            mbid, title, duration, _ = recording
            if track["recording_mbid"] and str(track["recording_mbid"]) != mbid:
                continue
            title_match = title_key(title) == title_key(str(track["title"]))
            duration_gap = (
                abs(duration - int(track["duration_ms"]))
                if duration is not None and track["duration_ms"] is not None
                else 10**9
            )
            mbid_match = bool(track["recording_mbid"] and str(track["recording_mbid"]) == mbid)
            if mbid_match or (title_match and duration_gap <= 5_000):
                choices.append((not mbid_match, duration_gap, recording_id, mbid))
        if choices:
            _, _, recording_id, mbid = min(choices)
            matched[str(track["id"])] = (recording_id, mbid)
    credits = {recording_id: recordings[recording_id][3] for recording_id, _ in matched.values()}
    return matched, credits


def match_recordings(core: Path, rows: Sequence[Mapping[str, Any]]) -> dict[str, tuple[int, str]]:
    """Return row id -> (recording id, recording mbid): mbid match, or title key match within 5,000 ms."""
    return match_recordings_with_credits(core, rows)[0]
